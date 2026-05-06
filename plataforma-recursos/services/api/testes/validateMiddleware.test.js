const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const express = require('express')

const {
	validarCamposTextoObrigatoriosNoBody,
	validarInteiroNoBody,
	validarPaginacaoNaQuery,
	validarInteiroOpcionalNaQuery,
} = require('../middleware/validate')

async function criarServidor() {
	const app = express()
	app.use(express.json())

	app.post('/body-obrigatorio', validarCamposTextoObrigatoriosNoBody(['titulo']), (req, res) => {
		res.json({ ok: true, body: req.body })
	})

	app.post('/inteiro-body', validarInteiroNoBody('ano', { min: 2000, max: 2100 }), (req, res) => {
		res.json({ ok: true, body: req.body })
	})

	app.get('/query', validarPaginacaoNaQuery({ limiteMaximo: 5 }), validarInteiroOpcionalNaQuery('ano', { min: 2000, max: 2100 }), (req, res) => {
		res.json({ ok: true, query: req.query })
	})

	const servidor = http.createServer(app)
	await new Promise((resolve) => servidor.listen(0, resolve))
	return { servidor, baseUrl: `http://127.0.0.1:${servidor.address().port}` }
}

async function pedidoJson(baseUrl, caminho, { method = 'GET', body, headers = {} } = {}) {
	const resposta = await fetch(`${baseUrl}${caminho}`, {
		method,
		headers: {
			...(body ? { 'content-type': 'application/json' } : {}),
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	})

	return { status: resposta.status, corpo: await resposta.json() }
}

async function fecharServidor(servidor) {
	await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
}

test('valida campos obrigatórios de texto no body', async () => {
	const { servidor, baseUrl } = await criarServidor()
	try {
		const invalido = await pedidoJson(baseUrl, '/body-obrigatorio', { method: 'POST', body: {} })
		assert.equal(invalido.status, 400)
		assert.equal(invalido.corpo.code, 'INVALID_INPUT')

		const valido = await pedidoJson(baseUrl, '/body-obrigatorio', { method: 'POST', body: { titulo: 'Teste' } })
		assert.equal(valido.status, 200)
		assert.equal(valido.corpo.body.titulo, 'Teste')
	} finally {
		await fecharServidor(servidor)
	}
})

test('valida e normaliza inteiro no body', async () => {
	const { servidor, baseUrl } = await criarServidor()
	try {
		const invalido = await pedidoJson(baseUrl, '/inteiro-body', { method: 'POST', body: { ano: 1999 } })
		assert.equal(invalido.status, 400)

		const valido = await pedidoJson(baseUrl, '/inteiro-body', { method: 'POST', body: { ano: '2025' } })
		assert.equal(valido.status, 200)
		assert.equal(valido.corpo.body.ano, 2025)
	} finally {
		await fecharServidor(servidor)
	}
})

test('valida paginação e inteiro opcional na query', async () => {
	const { servidor, baseUrl } = await criarServidor()
	try {
		const invalido = await pedidoJson(baseUrl, '/query?page=0&limit=10')
		assert.equal(invalido.status, 400)

		const valido = await pedidoJson(baseUrl, '/query?page=1&limit=5&ano=2024')
		assert.equal(valido.status, 200)
		assert.equal(valido.corpo.query.ano, '2024')
	} finally {
		await fecharServidor(servidor)
	}
})