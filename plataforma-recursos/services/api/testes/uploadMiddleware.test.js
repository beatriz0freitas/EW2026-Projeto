const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const express = require('express')

const { createSingleMemoryUpload, createMultipleMemoryUpload } = require('../middleware/upload')

async function criarServidor() {
	const app = express()

	app.post('/single', createSingleMemoryUpload({
		fieldName: 'sip',
		maxFileSizeBytes: 1024 * 1024,
		maxFieldSizeBytes: 1024,
		allowedExtensions: ['.zip'],
		allowedMimeTypes: ['application/zip'],
		errors: {
			fileTooLarge: { code: 'DEMASIADO_GRANDE', message: 'ficheiro grande demais' },
			fieldTooLarge: { code: 'CAMPO_DEMASIADO_GRANDE', message: 'campo grande demais' },
			invalidType: { code: 'TIPO_INVALIDO', message: 'tipo inválido' },
		},
	}), (req, res) => {
		res.json({ ok: true, nome: req.file?.originalname || null })
	})

	app.post('/multiple', createMultipleMemoryUpload({
		fieldName: 'ficheiros',
		maxFiles: 2,
		maxFileSizeBytes: 1024 * 1024,
		maxFieldSizeBytes: 1024,
		allowedExtensions: ['.txt'],
		allowedMimeTypes: ['text/plain'],
		errors: {
			fileTooLarge: { code: 'DEMASIADO_GRANDE', message: 'ficheiro grande demais' },
			fieldTooLarge: { code: 'CAMPO_DEMASIADO_GRANDE', message: 'campo grande demais' },
			tooManyFiles: { code: 'FICHEIROS_A_MAIS', message: 'ficheiros a mais' },
			invalidType: { code: 'TIPO_INVALIDO', message: 'tipo inválido' },
		},
	}), (req, res) => {
		res.json({ ok: true, quantidade: req.files?.length || 0 })
	})

	const servidor = http.createServer(app)
	await new Promise((resolve) => servidor.listen(0, resolve))
	return { servidor, baseUrl: `http://127.0.0.1:${servidor.address().port}` }
}

async function fecharServidor(servidor) {
	await new Promise((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
}

test('aceita upload single válido e rejeita tipo inválido', async () => {
	const { servidor, baseUrl } = await criarServidor()
	try {
		const formValido = new FormData()
		formValido.append('sip', new Blob(['conteudo'], { type: 'application/zip' }), 'pacote.zip')
		const respostaValida = await fetch(`${baseUrl}/single`, { method: 'POST', body: formValido })
		assert.equal(respostaValida.status, 200)
		assert.equal((await respostaValida.json()).nome, 'pacote.zip')

		const formInvalido = new FormData()
		formInvalido.append('sip', new Blob(['conteudo'], { type: 'text/plain' }), 'pacote.txt')
		const respostaInvalida = await fetch(`${baseUrl}/single`, { method: 'POST', body: formInvalido })
		assert.equal(respostaInvalida.status, 400)
		assert.equal((await respostaInvalida.json()).code, 'TIPO_INVALIDO')
	} finally {
		await fecharServidor(servidor)
	}
})

test('aceita upload múltiplo válido e rejeita excesso de ficheiros', async () => {
	const { servidor, baseUrl } = await criarServidor()
	try {
		const formValido = new FormData()
		formValido.append('ficheiros', new Blob(['a'], { type: 'text/plain' }), 'a.txt')
		formValido.append('ficheiros', new Blob(['b'], { type: 'text/plain' }), 'b.txt')
		const respostaValida = await fetch(`${baseUrl}/multiple`, { method: 'POST', body: formValido })
		assert.equal(respostaValida.status, 200)
		assert.equal((await respostaValida.json()).quantidade, 2)

		const formInvalido = new FormData()
		formInvalido.append('ficheiros', new Blob(['a'], { type: 'text/plain' }), 'a.txt')
		formInvalido.append('ficheiros', new Blob(['b'], { type: 'text/plain' }), 'b.txt')
		formInvalido.append('ficheiros', new Blob(['c'], { type: 'text/plain' }), 'c.txt')
		const respostaInvalida = await fetch(`${baseUrl}/multiple`, { method: 'POST', body: formInvalido })
		assert.equal(respostaInvalida.status, 400)
		assert.equal((await respostaInvalida.json()).code, 'FICHEIROS_A_MAIS')
	} finally {
		await fecharServidor(servidor)
	}
})