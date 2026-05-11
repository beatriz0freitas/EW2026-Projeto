const test = require('node:test')
const assert = require('node:assert/strict')

const { validateMetadata, validateMetadataResource } = require('../lib/metadataValidator')

test('valida metadados mínimos corretos e assume visibilidade pública', () => {
	const recurso = {
		tipo: ' Artigo ',
		titulo: 'Recurso de exemplo',
	}

	const resultado = validateMetadataResource(recurso)

	assert.equal(resultado.ok, true)
	assert.deepEqual(resultado.errors, [])
	assert.equal(recurso.tipo, 'artigo')
	assert.equal(recurso.visibilidade, 'publico')
})

test('aceita tipos novos e rejeita hashtags com espaços', () => {
	const resultado = validateMetadataResource({
		tipo: 'monografia interativa',
		titulo: 'Título válido',
		hashtags: ['tema invalido'],
	})

	assert.equal(resultado.ok, false)
	assert.equal(resultado.errors.some((erro) => erro.message.includes('tipo deve ser um de')), false)
	assert.match(resultado.errors.map((erro) => erro.message).join(' | '), /não pode conter espaços/)
})

test('aceita novo tipo de recurso fora da lista base', () => {
	const recurso = {
		tipo: 'trabalho de alunos',
		titulo: 'Portefólio final',
	}

	const resultado = validateMetadataResource(recurso)

	assert.equal(resultado.ok, true)
	assert.deepEqual(resultado.errors, [])
	assert.equal(recurso.tipo, 'trabalho de alunos')
})

test('converte lista de hashtags enviada em texto', () => {
	const resultado = validateMetadata({
		resource: {
			tipo: 'slides',
			titulo: 'Apresentação',
			hashtags: 'ensino, teste , plataforma',
		},
	})

	assert.equal(resultado.ok, true)
	assert.deepEqual(resultado.errors, [])
})

test('rejeita metadata sem resource', () => {
	const resultado = validateMetadata({})

	assert.equal(resultado.ok, false)
	assert.deepEqual(resultado.errors, [
		{ code: 'BAD_METADATA', message: 'metadata.resource é obrigatório' },
	])
})