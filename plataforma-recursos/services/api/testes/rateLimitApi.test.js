const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const express = require('express')

process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'teste-interno'

const { config } = require('../lib/config')
const { rateLimitApi } = require('../middleware/rateLimit')

async function criarServidorTeste() {
	const app = express()
	app.use((req, res, next) => {
		res.locals = res.locals || {}
		next()
	})
	app.use(rateLimitApi)
	app.get('/teste', (req, res) => {
		res.json({ ok: true })
	})
	app.get('/api/health', (req, res) => {
		res.json({ ok: true })
	})

	const servidor = http.createServer(app)
	await new Promise((resolve) => servidor.listen(0, resolve))
	const porto = servidor.address().port

	return {
		servidor,
		baseUrl: `http://127.0.0.1:${porto}`,
	}
}

async function pedido(baseUrl, caminho, { headers = {}, method = 'GET' } = {}) {
	const url = new URL(caminho, baseUrl)
	return new Promise((resolve, reject) => {
		const req = http.request(url, { method, headers }, (resposta) => {
			let texto = ''
			resposta.setEncoding('utf8')
			resposta.on('data', (parte) => {
				texto += parte
			})
			resposta.on('end', () => {
				resolve({
					status: resposta.statusCode,
					headers: resposta.headers,
					corpo: texto ? JSON.parse(texto) : null,
				})
			})
		})
		req.on('error', reject)
		req.end()
	})
}

test('ignora a rota de health no rate limiting', async () => {
	const { servidor, baseUrl } = await criarServidorTeste()
	const limiteOriginal = config.security.rateLimitMaxRequests

	try {
		config.security.rateLimitMaxRequests = 1
		const resposta1 = await pedido(baseUrl, '/api/health', { headers: { 'x-forwarded-for': '10.0.0.1' } })
		const resposta2 = await pedido(baseUrl, '/api/health', { headers: { 'x-forwarded-for': '10.0.0.1' } })

		assert.equal(resposta1.status, 200)
		assert.equal(resposta2.status, 200)
	} finally {
		config.security.rateLimitMaxRequests = limiteOriginal
		await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
	}
})

test('bloqueia pedidos a mais e devolve cabeçalhos de limite', async () => {
	const { servidor, baseUrl } = await criarServidorTeste()
	const limiteOriginal = config.security.rateLimitMaxRequests
	const janelaOriginal = config.security.rateLimitWindowMs

	try {
		config.security.rateLimitMaxRequests = 2
		config.security.rateLimitWindowMs = 60_000

		const headers = { 'x-forwarded-for': '10.0.0.2' }
		const resposta1 = await pedido(baseUrl, '/teste', { headers })
		const resposta2 = await pedido(baseUrl, '/teste', { headers })
		const resposta3 = await pedido(baseUrl, '/teste', { headers })

		assert.equal(resposta1.status, 200)
		assert.equal(resposta2.status, 200)
		assert.equal(resposta3.status, 429)
		assert.equal(resposta3.corpo.code, 'TOO_MANY_REQUESTS')
		assert.ok(resposta3.headers['ratelimit-limit'])
		assert.ok(resposta3.headers['ratelimit-remaining'] !== undefined)
		assert.ok(resposta3.headers['ratelimit-reset'])
		assert.ok(resposta3.headers['retry-after'])
	} finally {
		config.security.rateLimitMaxRequests = limiteOriginal
		config.security.rateLimitWindowMs = janelaOriginal
		await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
	}
})