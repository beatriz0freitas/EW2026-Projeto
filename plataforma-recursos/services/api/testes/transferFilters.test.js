const test = require('node:test')
const assert = require('node:assert/strict')

const {
	construirFiltrosTransferencia,
	construirDumpFiltrado,
	construirConsultaMongoColecao,
	construirOpcoesMongoColecao,
	haFiltrosAtivosNaColecao,
	scopeIncluiColecaoRaiz,
} = require('../transfer/filters')

test('normaliza scopes novos e deteta filtros ativos por coleção', () => {
	const filtros = construirFiltrosTransferencia({
		selectedTypes: ['comments', 'ratings'],
		ratingStars: '5',
		aipStatus: 'ok',
	})

	assert.equal(filtros.scope, 'all')
	assert.deepEqual(filtros.selectedTypes, ['comments', 'ratings'])
	assert.equal(filtros.ratingStars, 5)
	assert.equal(filtros.aipStatus, 'ok')
	assert.equal(haFiltrosAtivosNaColecao('ratings', filtros), true)
	assert.equal(haFiltrosAtivosNaColecao('aips', filtros), true)
	assert.equal(scopeIncluiColecaoRaiz('comments', filtros.scope, filtros.selectedTypes), true)
	assert.equal(scopeIncluiColecaoRaiz('posts', filtros.scope, filtros.selectedTypes), false)
})

test('constrói query Mongo para recursos e opções dos mais recentes', () => {
	const filtros = construirFiltrosTransferencia({
		resourceType: 'ficha',
		resourceYear: '2024',
		resourceVisibility: 'publico',
		resourceCreatedFrom: '2024-01-01',
		quantityLimit: '10',
		quantityOrder: 'recentes',
	})

	const query = construirConsultaMongoColecao('resources', filtros)
	const opcoes = construirOpcoesMongoColecao('resources', filtros)

	assert.equal(query['metadata.resource.tipo'] instanceof RegExp, true)
	assert.equal(query['metadata.resource.tipo'].source, '^ficha$')
	assert.equal(query['metadata.resource.tipo'].flags, 'i')
	assert.equal(query['metadata.resource.ano'], 2024)
	assert.equal(query['metadata.resource.visibilidade'] instanceof RegExp, true)
	assert.ok(query.createdAt.$gte instanceof Date)
	assert.deepEqual(opcoes, { sort: { createdAt: -1 }, limit: 10 })
})

test('suporta quantidade pelos mais antigos', () => {
	const filtros = construirFiltrosTransferencia({ quantityLimit: '3', quantityOrder: 'antigos' })
	const opcoes = construirOpcoesMongoColecao('resources', filtros)

	assert.equal(filtros.quantityLimit, 3)
	assert.equal(filtros.quantityOrder, 'antigos')
	assert.deepEqual(opcoes, { sort: { createdAt: 1 }, limit: 3 })
})

test('mantém comentários e AIP em scope direto sem exigir pais no dump', () => {
	const dump = {
		resources: [],
		news: [],
		users: [],
		posts: [],
		ratings: [],
		comments: [
			{ _id: 'c1', postId: 'p1', autorId: 'u1', createdAt: '2026-01-01T00:00:00.000Z' },
		],
		aips: [
			{ _id: 'a1', recursoId: 'r1', status: 'ok', dataIngestao: '2026-01-01T00:00:00.000Z' },
		],
		aip: [
			{ resourceId: 'r1', files: [{ path: 'bag/manifest.json', contentBase64: 'e30=' }] },
		],
	}

	const comentariosDiretos = construirDumpFiltrado(dump, construirFiltrosTransferencia({ scope: 'comments' }))
	assert.equal(comentariosDiretos.comments.length, 1)
	assert.equal(comentariosDiretos.posts.length, 0)
	assert.equal(comentariosDiretos.resources.length, 0)

	const aipDireto = construirDumpFiltrado(dump, construirFiltrosTransferencia({ scope: 'aip' }))
	assert.equal(aipDireto.aips.length, 1)
	assert.equal(aipDireto.aip.length, 1)
	assert.equal(aipDireto.resources.length, 0)
})
