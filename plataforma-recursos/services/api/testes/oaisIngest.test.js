const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const express = require('express')

function criarModuloFalso(caminho, exports) {
	return { id: caminho, filename: caminho, loaded: true, exports }
}

function carregarRouterIngestao({ construirSipSimplesImpl, ingerirSipZipImpl }) {
	const caminhoRouter = require.resolve('../oais/ingest')
	const caminhoSip = require.resolve('../oais/ingest/sip')
	const caminhoPacote = require.resolve('../oais/ingest/pacoteSimples')
	const caminhoResource = require.resolve('../models/Resource')
	const caminhoAuth = require.resolve('../middleware/auth')
	const caminhoConfig = require.resolve('../lib/config')
	const caminhoHttp = require.resolve('../lib/http')
	const caminhoNews = require.resolve('../lib/newsPublisher')
	const caminhoJobs = require.resolve('../jobs/systemNews')

	const anteriores = new Map()
	for (const caminho of [caminhoRouter, caminhoSip, caminhoPacote, caminhoResource, caminhoAuth, caminhoConfig, caminhoHttp, caminhoNews, caminhoJobs]) {
		anteriores.set(caminho, require.cache[caminho])
	}

	require.cache[caminhoSip] = criarModuloFalso(caminhoSip, { ingerirSipZip: ingerirSipZipImpl })
	require.cache[caminhoPacote] = criarModuloFalso(caminhoPacote, { construirSipSimples: construirSipSimplesImpl })
	require.cache[caminhoResource] = criarModuloFalso(caminhoResource, {
		findById: () => ({ lean: async () => ({ metadata: { resource: { titulo: 'Recurso', visibilidade: 'publico' } } }) }),
	})
	require.cache[caminhoAuth] = criarModuloFalso(caminhoAuth, {
		requireLevel: () => (req, res, next) => {
			req.user = { sub: 'produtor-1', role: 'produtor', nome: 'Produtor' }
			next()
		},
	})
	require.cache[caminhoConfig] = criarModuloFalso(caminhoConfig, {
		config: {
			oais: { maxSipFileSizeBytes: 100 * 1024 * 1024 },
			storage: { aipDir: '/tmp/aip-teste' },
		},
	})
	require.cache[caminhoHttp] = criarModuloFalso(caminhoHttp, {
		jsonError: (res, status, opcoes) => res.status(status).json({ ok: false, code: opcoes.code, message: opcoes.message, details: opcoes.details || null, error: opcoes.message }),
	})
	require.cache[caminhoNews] = criarModuloFalso(caminhoNews, { publishNews: async () => {} })
	require.cache[caminhoJobs] = criarModuloFalso(caminhoJobs, { publishTop3NewsIfChanged: async () => {} })

	delete require.cache[caminhoRouter]
	const router = require('../oais/ingest')

	return {
		router,
		repor() {
			for (const [caminho, moduloAnterior] of anteriores.entries()) {
				if (moduloAnterior) require.cache[caminho] = moduloAnterior
				else delete require.cache[caminho]
			}
		},
	}
}

async function criarServidor(router) {
	const app = express()
	app.use('/api/oais', router)
	const servidor = http.createServer(app)
	await new Promise((resolve) => servidor.listen(0, resolve))
	return { servidor, baseUrl: `http://127.0.0.1:${servidor.address().port}` }
}

async function fecharServidor(servidor) {
	await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
}

test('rota de ingestão SIP falha sem ficheiro preparado', async () => {
	const { router, repor } = carregarRouterIngestao({
		construirSipSimplesImpl: async () => ({ ok: false, errors: [] }),
		ingerirSipZipImpl: async () => ({ ok: false, errors: [] }),
	})
	const { servidor, baseUrl } = await criarServidor(router)

	try {
		const resposta = await fetch(`${baseUrl}/api/oais/ingest`, { method: 'POST' })
		const corpo = await resposta.json()
		assert.equal(resposta.status, 400)
		assert.equal(corpo.code, 'MISSING_FILE')
	} finally {
		await fecharServidor(servidor)
		repor()
	}
})

test('rota de submissão simples falha quando os dados do pacote são inválidos', async () => {
	const { router, repor } = carregarRouterIngestao({
		construirSipSimplesImpl: async () => ({ ok: false, errors: [{ code: 'BAD', message: 'erro de validação' }] }),
		ingerirSipZipImpl: async () => ({ ok: false, errors: [] }),
	})
	const { servidor, baseUrl } = await criarServidor(router)

	try {
		const form = new FormData()
		form.append('titulo', 'Teste')
		const resposta = await fetch(`${baseUrl}/api/oais/ingest/simples`, { method: 'POST', body: form })
		const corpo = await resposta.json()
		assert.equal(resposta.status, 422)
		assert.equal(corpo.code, 'SUBMISSAO_SIMPLES_INVALIDA')
		assert.equal(corpo.details[0].message, 'erro de validação')
	} finally {
		await fecharServidor(servidor)
		repor()
	}
})

test('rota de submissão simples devolve sucesso quando o SIP gerado é ingerido', async () => {
	const { router, repor } = carregarRouterIngestao({
		construirSipSimplesImpl: async () => ({
			ok: true,
			zipBuffer: Buffer.from('zip-gerado'),
			nomeOriginal: 'pacote.zip',
			metadados: { resource: { titulo: 'Teste' } },
		}),
		ingerirSipZipImpl: async () => ({
			ok: true,
			resourceId: '507f1f77bcf86cd799439011',
			recursoId: '507f1f77bcf86cd799439011',
			aipId: 'SIP-1',
			mensagem: 'SIP ingerido com sucesso',
		}),
	})
	const { servidor, baseUrl } = await criarServidor(router)

	try {
		const form = new FormData()
		form.append('titulo', 'Teste')
		const resposta = await fetch(`${baseUrl}/api/oais/ingest/simples`, { method: 'POST', body: form })
		const corpo = await resposta.json()
		assert.equal(resposta.status, 201)
		assert.equal(corpo.ok, true)
		assert.equal(corpo.resourceId, '507f1f77bcf86cd799439011')
		assert.deepEqual(corpo.metadata, { resource: { titulo: 'Teste' } })
	} finally {
		await fecharServidor(servidor)
		repor()
	}
})