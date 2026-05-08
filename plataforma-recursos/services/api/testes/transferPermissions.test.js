const test = require('node:test')
const assert = require('node:assert/strict')

const {
	obterCapacidadesTransferencia,
	restringirFiltrosTransferenciaPorPerfil,
	filtrarNoticiasRelacionadasARecursos,
} = require('../transfer/permissions')

test('consumidor exporta apenas recursos públicos e não pode importar', () => {
	const capacidades = obterCapacidadesTransferencia({ role: 'consumidor' })
	const filtros = restringirFiltrosTransferenciaPorPerfil({
		scope: 'users',
		selectedTypes: ['users', 'resources'],
		resourceVisibility: 'privado',
	}, { role: 'consumidor' }, 'export')

	assert.equal(capacidades.canExport, true)
	assert.equal(capacidades.canImport, false)
	assert.deepEqual(capacidades.allowedExportRootTypes, ['resources', 'news', 'posts', 'comments', 'ratings'])
	assert.deepEqual(filtros.selectedTypes, ['resources'])
	assert.equal(filtros.scope, 'all')
	assert.equal(filtros.resourceVisibility, 'publico')
})

test('produtor pode importar apenas recursos', () => {
	const capacidades = obterCapacidadesTransferencia({ role: 'produtor' })
	const filtros = restringirFiltrosTransferenciaPorPerfil({
		scope: 'all',
		selectedTypes: [],
	}, { role: 'produtor' }, 'import')

	assert.equal(capacidades.canImport, true)
	assert.deepEqual(capacidades.allowedImportRootTypes, ['resources'])
	assert.deepEqual(filtros.selectedTypes, ['resources'])
	assert.equal(filtros.scope, 'all')
})

test('filtra notícias relacionadas de forma segura para perfis não-admin', () => {
	const noticias = [
		{ _id: 'n1', eventType: 'system.new_submission', payload: { resourceId: 'r1' } },
		{ _id: 'n2', eventType: 'system.total_users', payload: { totalUsers: 10 } },
		{ _id: 'n3', eventType: 'system.top3', payload: { items: [{ id: 'r1' }, { id: 'r2' }] } },
		{ _id: 'n4', eventType: 'system.top3', payload: { items: [{ id: 'r1' }] } },
	]

	const filtradas = filtrarNoticiasRelacionadasARecursos(noticias, ['r1'], { role: 'consumidor' })

	assert.deepEqual(filtradas.map((item) => item._id), ['n1', 'n4'])
})

test('admin mantém acesso completo à transferência', () => {
	const capacidades = obterCapacidadesTransferencia({ role: 'admin' })
	const filtros = restringirFiltrosTransferenciaPorPerfil({
		scope: 'users',
		selectedTypes: ['users', 'news'],
	}, { role: 'admin' }, 'export')

	assert.equal(capacidades.canExport, true)
	assert.equal(capacidades.canImport, true)
	assert.deepEqual(capacidades.allowedExportRootTypes, ['resources', 'news', 'users', 'posts', 'comments', 'ratings'])
	assert.deepEqual(filtros.selectedTypes, ['users', 'news'])
	assert.equal(filtros.scope, 'users')
})