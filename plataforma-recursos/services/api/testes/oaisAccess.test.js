const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')

const express = require('express')

function criarModuloFalso(caminho, exports) {
	return {
		id: caminho,
		filename: caminho,
		loaded: true,
		exports,
	}
}

function carregarRouterOaisAccess({
		recursoPorId,
		utilizadorPorPedido,
		dipConstruido,
		idsValidos = new Set(['507f1f77bcf86cd799439011']),
}) {
	const caminhoRouter = require.resolve('../oais/access')
	const caminhoAip = require.resolve('../models/Aip')
	const caminhoResource = require.resolve('../models/Resource')
	const caminhoDip = require.resolve('../oais/access/dip')
	const caminhoAuth = require.resolve('../middleware/auth')
	const caminhoConfig = require.resolve('../lib/config')
	const caminhoHttp = require.resolve('../lib/http')
	const caminhoJobs = require.resolve('../jobs/systemNews')

	const anteriores = new Map()
	for (const caminho of [caminhoRouter, caminhoAip, caminhoResource, caminhoDip, caminhoAuth, caminhoConfig, caminhoHttp, caminhoJobs]) {
		anteriores.set(caminho, require.cache[caminho])
	}

	const chamadas = {
		resourceUpdateOne: [],
		aipUpdateOne: [],
		publishTop3: 0,
	}

	require.cache[caminhoAip] = criarModuloFalso(caminhoAip, {
		updateOne: async (...args) => {
			chamadas.aipUpdateOne.push(args)
			return { acknowledged: true }
		},
	})

	require.cache[caminhoResource] = criarModuloFalso(caminhoResource, {
		findById: async (id) => recursoPorId(id),
		updateOne: async (...args) => {
			chamadas.resourceUpdateOne.push(args)
			return { acknowledged: true }
		},
	})

	require.cache[caminhoDip] = criarModuloFalso(caminhoDip, {
		construirDipZip: async (args) => dipConstruido(args.resource, args),
	})

	require.cache[caminhoAuth] = criarModuloFalso(caminhoAuth, {
		optionalAuth: (req, res, next) => {
			req.user = utilizadorPorPedido(req)
			next()
		},
	})

	require.cache[caminhoConfig] = criarModuloFalso(caminhoConfig, {
		config: {
			storage: { aipDir: '/tmp/aip-teste' },
		},
	})

	require.cache[caminhoHttp] = criarModuloFalso(caminhoHttp, {
		jsonError: (res, status, opcoes) => {
			const payload = {
				ok: false,
				code: opcoes.code,
				message: opcoes.message,
				details: opcoes.details || null,
				error: opcoes.message,
			}
			return res.status(status).json(payload)
		},
		isMongoId: (valor) => idsValidos.has(String(valor)),
	})

	require.cache[caminhoJobs] = criarModuloFalso(caminhoJobs, {
		publishTop3NewsIfChanged: async () => {
			chamadas.publishTop3 += 1
		},
	})

	delete require.cache[caminhoRouter]
	const router = require('../oais/access')

	function repor() {
		for (const [caminho, moduloAnterior] of anteriores.entries()) {
			if (moduloAnterior) {
				require.cache[caminho] = moduloAnterior
			} else {
				delete require.cache[caminho]
			}
		}
	}

	return { router, chamadas, repor }
}

async function criarServidor(router) {
	const app = express()
	app.use('/api/oais', router)

	const servidor = http.createServer(app)
	await new Promise((resolve) => servidor.listen(0, resolve))
	const porto = servidor.address().port
	return {
		servidor,
		baseUrl: `http://127.0.0.1:${porto}`,
	}
}

async function pedido(baseUrl, caminho, { headers = {} } = {}) {
	const url = new URL(caminho, baseUrl)
	return new Promise((resolve, reject) => {
		const req = http.request(url, { method: 'GET', headers }, (resposta) => {
			const partes = []
			resposta.on('data', (parte) => partes.push(parte))
			resposta.on('end', () => {
				const buffer = Buffer.concat(partes)
				let corpo = null
				const tipo = String(resposta.headers['content-type'] || '')
				if (tipo.includes('application/json')) {
					corpo = JSON.parse(buffer.toString('utf8'))
				}
				resolve({
					status: resposta.statusCode,
					headers: resposta.headers,
					buffer,
					corpo,
				})
			})
		})
		req.on('error', reject)
		req.end()
	})
}

async function fecharServidor(servidor) {
	await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
}

test('rota OAIS de acesso rejeita id inválido', async () => {
	const { router, repor } = carregarRouterOaisAccess({
		recursoPorId: async () => null,
		utilizadorPorPedido: () => null,
		dipConstruido: async () => null,
		idsValidos: new Set(),
	})
	const { servidor, baseUrl } = await criarServidor(router)

	try {
		const resposta = await pedido(baseUrl, '/api/oais/access/id-invalido')
		assert.equal(resposta.status, 400)
		assert.equal(resposta.corpo.code, 'INVALID_ID')
	} finally {
		await fecharServidor(servidor)
		repor()
	}
})

test('rota OAIS de acesso exige autenticação para recurso privado', async () => {
	const id = '507f1f77bcf86cd799439011'
	const { router, repor } = carregarRouterOaisAccess({
		recursoPorId: async () => ({
			_id: id,
			produtor: 'prod-1',
			metadata: { resource: { visibilidade: 'privado' } },
		}),
		utilizadorPorPedido: () => null,
		dipConstruido: async () => null,
	})
	const { servidor, baseUrl } = await criarServidor(router)

	try {
		const resposta = await pedido(baseUrl, `/api/oais/access/${id}`)
		assert.equal(resposta.status, 401)
		assert.equal(resposta.corpo.code, 'AUTH_REQUIRED')
	} finally {
		await fecharServidor(servidor)
		repor()
	}
})

test('rota OAIS de acesso devolve DIP ZIP e atualiza contadores', async () => {
	const id = '507f1f77bcf86cd799439011'
	const bufferDip = Buffer.from('zip-simulado')
	let argsDip = null
	const { router, chamadas, repor } = carregarRouterOaisAccess({
		recursoPorId: async () => ({
			_id: id,
			produtor: 'prod-1',
			metadata: { resource: { visibilidade: 'privado' } },
		}),
		utilizadorPorPedido: (req) => ({
			sub: req.headers['x-user-sub'] || null,
			role: req.headers['x-user-role'] || null,
		}),
		dipConstruido: async (resource, args) => {
			argsDip = args
			return {
				buffer: bufferDip,
				filename: `DIP-${id}.zip`,
			}
		},
	})
	const { servidor, baseUrl } = await criarServidor(router)

	try {
		const resposta = await pedido(baseUrl, `/api/oais/access/${id}?selection=manual&file=ficheiros/a.pdf`, {
			headers: {
				'x-user-sub': 'prod-1',
				'x-user-role': 'produtor',
			},
		})

		assert.equal(resposta.status, 200)
		assert.equal(resposta.headers['content-type'], 'application/zip')
		assert.equal(resposta.headers['content-disposition'], `attachment; filename="DIP-${id}.zip"`)
		assert.deepEqual(resposta.buffer, bufferDip)
		assert.deepEqual(argsDip.selecionados, 'ficheiros/a.pdf')
		assert.equal(chamadas.resourceUpdateOne.length, 1)
		assert.equal(chamadas.aipUpdateOne.length, 1)
		assert.equal(chamadas.publishTop3, 1)
	} finally {
		await fecharServidor(servidor)
		repor()
	}
})
