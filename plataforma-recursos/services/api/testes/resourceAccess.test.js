const test = require('node:test')
const assert = require('node:assert/strict')

const {
	canViewResource,
	visibilityQuery,
	resourceAccessError,
	resourceSummary,
} = require('../lib/resourceAccess')

test('permite ver recurso público sem utilizador autenticado', () => {
	const recurso = { metadata: { resource: { visibilidade: 'publico' } }, produtor: 'u1' }
	assert.equal(canViewResource(recurso, null), true)
})

test('permite ver recurso privado ao admin e ao produtor, mas não a outro utilizador', () => {
	const recurso = { metadata: { resource: { visibilidade: 'privado' } }, produtor: 'u1' }

	assert.equal(canViewResource(recurso, { sub: 'admin', role: 'admin' }), true)
	assert.equal(canViewResource(recurso, { sub: 'u1', role: 'produtor' }), true)
	assert.equal(canViewResource(recurso, { sub: 'u2', role: 'produtor' }), false)
})

test('gera query de visibilidade adequada ao perfil', () => {
	assert.deepEqual(visibilityQuery(null), { 'metadata.resource.visibilidade': 'publico' })
	assert.deepEqual(visibilityQuery({ role: 'admin', sub: 'a1' }), {})
	assert.deepEqual(visibilityQuery({ role: 'produtor', sub: 'u1' }), {
		$or: [{ 'metadata.resource.visibilidade': 'publico' }, { produtor: 'u1' }],
	})
})

test('devolve erro correto para acesso negado a recurso privado', () => {
	const recurso = { metadata: { resource: { visibilidade: 'privado' } } }

	assert.deepEqual(resourceAccessError(recurso, null), {
		status: 401,
		body: { code: 'AUTH_REQUIRED', message: 'autenticação necessária para recursos privados' },
	})

	assert.deepEqual(resourceAccessError(recurso, { sub: 'u2', role: 'produtor' }), {
		status: 403,
		body: { code: 'FORBIDDEN', message: 'acesso negado' },
	})
})

test('resume recurso com defaults seguros', () => {
	assert.equal(resourceSummary(null), null)
	assert.deepEqual(resourceSummary({ _id: '1', metadata: {} }), {
		_id: '1',
		titulo: 'recurso sem título',
		tipo: '',
		visibilidade: 'privado',
	})
})