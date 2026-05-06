const test = require('node:test')
const assert = require('node:assert/strict')

const { validateMetadata, validateMetadataResource } = require('../lib/metadataValidator')

test('valida metadados mínimos corretos e assume visibilidade pública', () => {
	const recurso = {
		tipo: 'artigo',
		titulo: 'Recurso de exemplo',
	}

	const resultado = validateMetadataResource(recurso)

	assert.equal(resultado.ok, true)
	assert.deepEqual(resultado.errors, [])
	assert.equal(recurso.visibilidade, 'publico')
})

test('rejeita hashtags com espaços e tipo inválido', () => {
	const resultado = validateMetadataResource({
		tipo: 'desconhecido',
		titulo: 'Título válido',
		hashtags: ['tema invalido'],
	})

	assert.equal(resultado.ok, false)
	assert.match(resultado.errors.map((erro) => erro.message).join(' | '), /tipo deve ser um de/)
	assert.match(resultado.errors.map((erro) => erro.message).join(' | '), /não pode conter espaços/)
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