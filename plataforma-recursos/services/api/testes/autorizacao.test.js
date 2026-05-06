const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const express = require('express')

process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'teste-interno'
process.env.AUTH_URL = process.env.AUTH_URL || 'http://auth:16027'

const { requireLevel, optionalAuth } = require('../middleware/auth')

function responderJson(res, corpo, status = 200) {
	res.status(status).json(corpo)
}

async function criarServidorTeste() {
	const app = express()
	app.use(express.json())

	app.get('/protegido', requireLevel('produtor'), (req, res) => {
		return responderJson(res, {
			ok: true,
			utilizador: req.user,
		})
	})

	app.get('/opcional', optionalAuth, (req, res) => {
		return responderJson(res, {
			ok: true,
			temUtilizador: Boolean(req.user),
			role: req.user?.role || null,
		})
	})

	const servidor = http.createServer(app)
	await new Promise((resolve) => servidor.listen(0, resolve))
	const porto = servidor.address().port

	return {
		servidor,
		baseUrl: `http://127.0.0.1:${porto}`,
	}
}

async function pedidoJson(baseUrl, caminho, { headers = {} } = {}) {
	const url = new URL(caminho, baseUrl)

	return new Promise((resolve, reject) => {
		const req = http.request(
			url,
			{
				method: 'GET',
				headers,
			},
			(resposta) => {
				let texto = ''
				resposta.setEncoding('utf8')
				resposta.on('data', (parte) => {
					texto += parte
				})
				resposta.on('end', () => {
					try {
						resolve({
							status: resposta.statusCode,
							corpo: texto ? JSON.parse(texto) : null,
						})
					} catch (erro) {
						reject(erro)
					}
				})
			}
		)

		req.on('error', reject)
		req.end()
	})
}

test('rota protegida exige autenticação', async () => {
	const fetchOriginal = global.fetch
	global.fetch = async () => {
		throw new Error('não devia chamar o serviço auth sem token')
	}

	const { servidor, baseUrl } = await criarServidorTeste()

	try {
		const resposta = await pedidoJson(baseUrl, '/protegido')

		assert.equal(resposta.status, 401)
		assert.equal(resposta.corpo.code, 'AUTH_REQUIRED')
	} finally {
		await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
		global.fetch = fetchOriginal
	}
})

test('rota protegida rejeita consumidor e aceita produtor', async () => {
	const fetchOriginal = global.fetch
	global.fetch = async (url, opcoes) => {
		const token = String(opcoes?.headers?.Authorization || '').replace('Bearer ', '')
		if (token === 'token-consumidor') {
			return {
				ok: true,
				json: async () => ({ ok: true, payload: { sub: 'u1', role: 'consumidor' } }),
			}
		}

		if (token === 'token-produtor') {
			return {
				ok: true,
				json: async () => ({ ok: true, payload: { sub: 'u2', role: 'produtor' } }),
			}
		}

		return {
			ok: false,
			json: async () => ({ ok: false }),
		}
	}

	const { servidor, baseUrl } = await criarServidorTeste()

	try {
		const respostaConsumidor = await pedidoJson(baseUrl, '/protegido', {
			headers: { Authorization: 'Bearer token-consumidor' },
		})
		assert.equal(respostaConsumidor.status, 403)
		assert.equal(respostaConsumidor.corpo.code, 'FORBIDDEN')

		const respostaProdutor = await pedidoJson(baseUrl, '/protegido', {
			headers: { Authorization: 'Bearer token-produtor' },
		})
		assert.equal(respostaProdutor.status, 200)
		assert.equal(respostaProdutor.corpo.ok, true)
		assert.equal(respostaProdutor.corpo.utilizador.role, 'produtor')
	} finally {
		await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
		global.fetch = fetchOriginal
	}
})

test('autenticação opcional injeta utilizador quando o token é válido', async () => {
	const fetchOriginal = global.fetch
	global.fetch = async (url, opcoes) => {
		const token = String(opcoes?.headers?.Authorization || '').replace('Bearer ', '')
		if (token === 'token-admin') {
			return {
				ok: true,
				json: async () => ({ ok: true, payload: { sub: 'a1', role: 'admin' } }),
			}
		}

		return {
			ok: false,
			json: async () => ({ ok: false }),
		}
	}

	const { servidor, baseUrl } = await criarServidorTeste()

	try {
		const semToken = await pedidoJson(baseUrl, '/opcional')
		assert.equal(semToken.status, 200)
		assert.equal(semToken.corpo.temUtilizador, false)

		const comToken = await pedidoJson(baseUrl, '/opcional', {
			headers: { Authorization: 'Bearer token-admin' },
		})
		assert.equal(comToken.status, 200)
		assert.equal(comToken.corpo.temUtilizador, true)
		assert.equal(comToken.corpo.role, 'admin')
	} finally {
		await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
		global.fetch = fetchOriginal
	}
})