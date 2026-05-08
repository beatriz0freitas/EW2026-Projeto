const test = require('node:test')
const assert = require('node:assert/strict')

const {
	obterCapacidadesTransferencia,
	restringirFiltrosTransferenciaPorPerfil,
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
	assert.deepEqual(capacidades.allowedExportRootTypes, ['resources'])
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