const Resource = require('../models/Resource')
const Aip = require('../models/Aip')
const NewsItem = require('../models/NewsItem')
const Post = require('../models/Post')
const Rating = require('../models/Rating')
const Comment = require('../models/Comment')
const { config } = require('../lib/config')
const { construirCaminhoAipRecurso, construirFicheiroAipGuardado, exportarFicheirosAip, reporFicheirosAip } = require('../oais/aipStorage')
const {
	construirFiltrosTransferencia,
	construirDumpFiltrado,
	construirConsultaMongoColecao,
	construirOpcoesMongoColecao,
	haFiltrosAtivosNaColecao,
	scopeIncluiColecaoRaiz,
} = require('../transfer/filters')
const {
	obterCapacidadesTransferencia,
	restringirFiltrosTransferenciaPorPerfil,
	filtrarNoticiasRelacionadasARecursos,
} = require('../transfer/permissions')
const { jsonError } = require('../lib/http')
const { exportUsersForTransfer, importUsersForTransfer } = require('../transfer/authClient')
const { visibilityQuery } = require('../lib/resourceAccess')

function extrairDumpDoPedido(req) {
	if (req.file?.buffer?.length) {
		try {
			return JSON.parse(req.file.buffer.toString('utf8'))
		} catch {
			throw new Error('INVALID_DUMP_FILE')
		}
	}

	if (typeof req.body?.dump === 'string' && req.body.dump.trim()) {
		try {
			return JSON.parse(req.body.dump)
		} catch {
			throw new Error('INVALID_DUMP_TEXT')
		}
	}

	if (req.body?.dump && typeof req.body.dump === 'object' && !Array.isArray(req.body.dump)) {
		return req.body.dump
	}

	return req.body
}

function filtrarNoticiasDerivadasInvalidas(news, recursosPublicos) {
	return news.filter((item) => {
		if (item?.eventType !== 'system.top3') return true
		const entries = Array.isArray(item?.payload?.items) ? item.payload.items : []
		return entries.length > 0 && entries.every((entry) => recursosPublicos.has(String(entry.id)))
	})
}

function combinarConsultas(...consultas) {
	const validas = consultas.filter((consulta) => consulta && Object.keys(consulta).length)
	if (!validas.length) return {}
	if (validas.length === 1) return validas[0]
	return { $and: validas }
}

function aplicarOpcoesConsulta(consulta, opcoes = {}) {
	if (opcoes.sort) consulta.sort(opcoes.sort)
	if (opcoes.limit) consulta.limit(opcoes.limit)
	return consulta
}

async function consultarColecao(Model, nomeColecao, filtros, consultaExtra = null) {
	const consultaBase = construirConsultaMongoColecao(nomeColecao, filtros)
	const consultaFinal = combinarConsultas(consultaBase, consultaExtra)
	const opcoes = construirOpcoesMongoColecao(nomeColecao, filtros)
	return aplicarOpcoesConsulta(Model.find(consultaFinal).lean(), opcoes)
}

function extrairIds(itens, campo = '_id') {
	return itens
		.map((item) => item?.[campo])
		.filter((valor) => valor !== undefined && valor !== null)
		.map((valor) => String(valor))
}

function criarFiltroIds(campo, ids) {
	if (!Array.isArray(ids) || !ids.length) return null
	return { [campo]: { $in: ids } }
}

async function construirIdsRecursosPublicos() {
	const recursos = await Resource.find({ 'metadata.resource.visibilidade': 'publico' }).select({ _id: 1 }).lean()
	return new Set(recursos.map((resource) => String(resource._id)))
}

async function exportarEntradasAip(resourceIds) {
	const idsUnicos = [...new Set((resourceIds || []).filter(Boolean).map((id) => String(id)))]
	const entradas = []

	for (const recursoId of idsUnicos) {
		try {
			entradas.push(await exportarFicheirosAip({ _id: recursoId }, config.storage.aipDir))
		} catch (err) {
			console.error(`[export] erro ao incluir AIP do recurso ${recursoId}:`, err)
			throw new Error(`AIP_EXPORT_FAILED:${recursoId}`)
		}
	}

	return entradas
}

module.exports.exportAll = async (req, res) => {
	try {
		const capacidades = obterCapacidadesTransferencia(req.user)
		if (!capacidades.canExport) {
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'não tem permissões para exportar dados globais' })
		}

		const filtros = restringirFiltrosTransferenciaPorPerfil(
			construirFiltrosTransferencia(req.query),
			req.user,
			'export'
		)
		const tiposPermitidos = new Set(capacidades.allowedExportRootTypes)
		const tiposSelecionados = Array.isArray(filtros.selectedTypes) ? filtros.selectedTypes : []
		const selecionaDiretamente = (tipo) => tiposSelecionados.length ? tiposSelecionados.includes(tipo) : filtros.scope === tipo
		const incluirResources = tiposPermitidos.has('resources') && scopeIncluiColecaoRaiz('resources', filtros.scope, filtros.selectedTypes)
		const incluirNews = tiposPermitidos.has('news') && scopeIncluiColecaoRaiz('news', filtros.scope, filtros.selectedTypes)
		const incluirUsers = tiposPermitidos.has('users') && scopeIncluiColecaoRaiz('users', filtros.scope, filtros.selectedTypes)
		const scopeNewsDireto = selecionaDiretamente('news')
		const scopePostsDireto = selecionaDiretamente('posts')
		const scopeRatingsDireto = selecionaDiretamente('ratings')
		const scopeCommentsDireto = selecionaDiretamente('comments')
		const scopeAipDireto = selecionaDiretamente('aip')
		const recursosFiltrados = incluirResources && haFiltrosAtivosNaColecao('resources', filtros)
		const postsFiltrados = haFiltrosAtivosNaColecao('posts', filtros)
		const precisaRecursosVisiveis = incluirResources || scopeNewsDireto || scopePostsDireto || scopeRatingsDireto || scopeCommentsDireto || scopeAipDireto

		const [resources, users] = await Promise.all([
			precisaRecursosVisiveis
				? consultarColecao(Resource, 'resources', filtros, visibilityQuery(req.user))
				: Promise.resolve([]),
			incluirUsers ? exportUsersForTransfer() : Promise.resolve([]),
		])

		const resourcesSelecionados = incluirResources ? resources : []
		const resourceIds = extrairIds(resources)
		const filtroPostsPorResources = !scopePostsDireto && recursosFiltrados
		const filtroRatingsPorResources = !scopeRatingsDireto && recursosFiltrados
		const filtroAipsPorResources = !scopeAipDireto && recursosFiltrados
		const filtroPostsPorPermissao = req.user?.role !== 'admin'
		const filtroRatingsPorPermissao = req.user?.role !== 'admin'

		const posts = (tiposPermitidos.has('posts') && (scopePostsDireto || incluirResources))
			? await consultarColecao(
				Post,
				'posts',
				filtros,
				(filtroPostsPorPermissao || filtroPostsPorResources)
					? criarFiltroIds('resourceId', resourceIds) || { _id: null }
					: null
			)
			: []

		const postIds = extrairIds(posts)
		const filtroCommentsPorPosts = !scopeCommentsDireto && (postsFiltrados || filtroPostsPorResources)
		const ratings = (tiposPermitidos.has('ratings') && (scopeRatingsDireto || incluirResources))
			? await consultarColecao(
				Rating,
				'ratings',
				filtros,
				(filtroRatingsPorPermissao || filtroRatingsPorResources)
					? criarFiltroIds('resourceId', resourceIds) || { _id: null }
					: null
			)
			: []

		const comments = (tiposPermitidos.has('comments') && (scopeCommentsDireto || incluirResources || scopePostsDireto))
			? await consultarColecao(
				Comment,
				'comments',
				filtros,
				filtroCommentsPorPosts ? criarFiltroIds('postId', postIds) || { _id: null } : null
			)
			: []

		const aips = scopeAipDireto || incluirResources
			? await consultarColecao(
				Aip,
				'aips',
				filtros,
				filtroAipsPorResources ? criarFiltroIds('recursoId', resourceIds) || { _id: null } : null
			)
			: []

		const newsRaw = incluirNews ? await consultarColecao(NewsItem, 'news', filtros) : []
		const recursosPublicos = incluirNews ? await construirIdsRecursosPublicos() : new Set()
		const newsSeguras = incluirNews ? filtrarNoticiasDerivadasInvalidas(newsRaw, recursosPublicos) : []
		const news = incluirNews
			? filtrarNoticiasRelacionadasARecursos(newsSeguras, resourceIds, req.user)
			: []

		const dumpFiltrado = construirDumpFiltrado({ resources: resourcesSelecionados, news, users, posts, ratings, comments, aips }, filtros)
		const idsParaExportarAip = dumpFiltrado.resources.length
			? extrairIds(dumpFiltrado.resources)
			: extrairIds(dumpFiltrado.aips, 'recursoId')
		const aip = await exportarEntradasAip(idsParaExportarAip)
		const dumpFinal = construirDumpFiltrado({ ...dumpFiltrado, aip }, filtros)

		res.setHeader('Content-Disposition', `attachment; filename="ew2026-export-${Date.now()}.json"`)
		res.setHeader('Content-Type', 'application/json')
		res.json({
			version: '2',
			exportedAt: new Date().toISOString(),
			filtersApplied: filtros,
			resources: dumpFinal.resources,
			aips: dumpFinal.aips,
			news: dumpFinal.news,
			users: dumpFinal.users,
			posts: dumpFinal.posts,
			ratings: dumpFinal.ratings,
			comments: dumpFinal.comments,
			aip: dumpFinal.aip,
		})
	} catch (err) {
		if (String(err?.message || '').startsWith('AIP_EXPORT_FAILED:')) {
			const recursoId = String(err.message).split(':')[1] || 'desconhecido'
			return jsonError(res, 500, {
				code: 'AIP_EXPORT_FAILED',
				message: `falha ao exportar ficheiros AIP do recurso ${recursoId}`,
			})
		}
		console.error('[export] erro:', err)
		jsonError(res, 500, 'erro interno ao exportar')
	}
}

module.exports.importAll = async (req, res) => {
	const capacidades = obterCapacidadesTransferencia(req.user)
	if (!capacidades.canImport) {
		return jsonError(res, 403, { code: 'FORBIDDEN', message: 'não tem permissões para importar dados globais' })
	}

	const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
	let dump

	try {
		dump = extrairDumpDoPedido(req)
	} catch (err) {
		const code = err?.message === 'INVALID_DUMP_FILE' ? 'INVALID_DUMP_FILE' : 'INVALID_DUMP_TEXT'
		const message = code === 'INVALID_DUMP_FILE'
			? 'ficheiro de dump inválido ou com JSON mal formado'
			: 'campo dump inválido ou com JSON mal formado'
		return jsonError(res, 400, { code, message })
	}

	const filtros = restringirFiltrosTransferenciaPorPerfil(
		construirFiltrosTransferencia(payload.filters || payload || req.query),
		req.user,
		'import'
	)

	if (!dump || dump.version !== '2') {
		return jsonError(res, 400, {
			code: 'INVALID_DUMP',
			message: 'dump inválido ou versão não suportada (esperado version: "2")',
		})
	}

	const results = {
		resources: { upserted: 0, errors: [] },
		news: { upserted: 0, errors: [] },
		users: { upserted: 0, errors: [] },
		posts: { upserted: 0, errors: [] },
		ratings: { upserted: 0, errors: [] },
		comments: { upserted: 0, errors: [] },
		aip: { restored: 0, errors: [] },
		aips: { upserted: 0, errors: [] },
	}

	const importedResourceIds = new Set()
	const dumpFiltrado = construirDumpFiltrado(dump, filtros)

	async function recursoImportavelPeloProdutor(resourceId) {
		if (req.user?.role !== 'produtor') return true
		const existente = await Resource.findById(resourceId).select({ produtor: 1 }).lean()
		if (!existente) return true
		return String(existente.produtor || '') === String(req.user.sub)
	}

	async function upsertAll(Model, docs, key) {
		if (!Array.isArray(docs)) return

		for (const doc of docs) {
			try {
				const nextDoc = { ...doc }

				if (key === 'resources') {
					if (!(await recursoImportavelPeloProdutor(doc._id))) {
						results[key].errors.push({ id: String(doc._id), message: 'recurso pertence a outro produtor' })
						continue
					}

					const resourceAipPath = construirCaminhoAipRecurso(config.storage.aipDir, doc._id)
					nextDoc.aipPath = resourceAipPath
					nextDoc.aipFile = construirFicheiroAipGuardado({
						caminhoAipRecurso: resourceAipPath,
						nomeOriginal: doc.aipFile?.originalName,
						mimeType: doc.aipFile?.mimeType,
						tamanho: doc.aipFile?.size,
					})

					if (req.user?.role === 'produtor') {
						nextDoc.produtor = req.user.sub
					}
				}

				if (key === 'aips') {
					if (!(await recursoImportavelPeloProdutor(doc.recursoId))) {
						results[key].errors.push({ id: String(doc._id), message: 'AIP associado a recurso não gerível por este produtor' })
						continue
					}

					if (req.user?.role === 'produtor') {
						nextDoc.produtor = req.user.sub
					}
				}

				await Model.findByIdAndUpdate(doc._id, { $set: nextDoc }, { upsert: true, new: true })
				results[key].upserted++

				if (key === 'resources') {
					importedResourceIds.add(String(doc._id))
				}
			} catch (err) {
				results[key].errors.push({ id: String(doc._id), message: err.message })
			}
		}
	}

	async function restoreAllAip(resources, aipDocs, aipEntries) {
		const resourceIds = new Set([
			...((Array.isArray(resources) ? resources : []).map((resource) => String(resource._id))),
			...((Array.isArray(aipDocs) ? aipDocs : []).map((aipDoc) => String(aipDoc.recursoId))),
		])

		if (!resourceIds.size) return

		const entriesById = new Map(Array.isArray(aipEntries) ? aipEntries.map((entry) => [String(entry.resourceId), entry]) : [])

		for (const resourceId of resourceIds) {
			if (req.user?.role === 'produtor' && !importedResourceIds.has(resourceId)) continue
			if (importedResourceIds.size && !importedResourceIds.has(resourceId) && !entriesById.has(resourceId)) continue

			const entry = entriesById.get(resourceId)
			if (!entry) {
				results.aip.errors.push({
					id: resourceId,
					message:
						'dump sem ficheiros AIP para este recurso',
				})
				continue
			}

			try {
				await reporFicheirosAip({
					pastaAip: config.storage.aipDir,
					recursoId: resourceId,
					files: entry.files,
				})
				results.aip.restored++
			} catch (err) {
				results.aip.errors.push({ id: resourceId, message: err.message })
			}
		}
	}

	await upsertAll(Resource, dumpFiltrado.resources, 'resources')
	await upsertAll(Aip, dumpFiltrado.aips, 'aips')
	await upsertAll(NewsItem, dumpFiltrado.news, 'news')
	if (Array.isArray(dumpFiltrado.users) && dumpFiltrado.users.length) {
		try {
			results.users = await importUsersForTransfer(dumpFiltrado.users)
		} catch (err) {
			results.users.errors.push({
				id: 'auth',
				message: err.message || 'falha ao importar utilizadores no servico auth',
			})
		}
	}
	await upsertAll(Post, dumpFiltrado.posts, 'posts')
	await upsertAll(Rating, dumpFiltrado.ratings, 'ratings')
	await upsertAll(Comment, dumpFiltrado.comments, 'comments')
	await restoreAllAip(dumpFiltrado.resources, dumpFiltrado.aips, dumpFiltrado.aip)

	const totalErrors = Object.values(results).reduce((sum, result) => sum + result.errors.length, 0)

	res.status(totalErrors === 0 ? 200 : 207).json({
		ok: totalErrors === 0,
		filtersApplied: filtros,
		results,
	})
}
