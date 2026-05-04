const Resource = require('../models/Resource')
const Aip = require('../models/Aip')
const NewsItem = require('../models/NewsItem')
const Post = require('../models/Post')
const Rating = require('../models/Rating')
const Comment = require('../models/Comment')
const { config } = require('../lib/config')
const { buildResourceAipPath, buildStoredAipFile, exportAipFiles, restoreAipFiles } = require('../lib/aipStorage')
const { construirFiltrosTransferencia, construirDumpFiltrado } = require('../lib/dataTransferFilters')
const { jsonError } = require('../lib/http')

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

function filtrarNoticiasDerivadasInvalidas(news, resources) {
	const recursosPublicos = new Set(
		resources
			.filter((resource) => resource?.metadata?.resource?.visibilidade === 'publico')
			.map((resource) => String(resource._id))
	)

	return news.filter((item) => {
		if (item?.eventType !== 'system.top3') return true
		const entries = Array.isArray(item?.payload?.items) ? item.payload.items : []
		return entries.length > 0 && entries.every((entry) => recursosPublicos.has(String(entry.id)))
	})
}

module.exports.exportAll = async (req, res) => {
	try {
		const filtros = construirFiltrosTransferencia(req.query)
		const [resources, aips, newsRaw, posts, ratings, comments] = await Promise.all([
			Resource.find().lean(),
			Aip.find().lean(),
			NewsItem.find().lean(),
			Post.find().lean(),
			Rating.find().lean(),
			Comment.find().lean(),
		])
		const news = filtrarNoticiasDerivadasInvalidas(newsRaw, resources)

		const dumpFiltrado = construirDumpFiltrado({ resources, news, posts, ratings, comments }, filtros)
		const resourceIdsFiltrados = new Set(dumpFiltrado.resources.map((resource) => String(resource._id)))
		const aipsFiltrados = aips.filter((aipDoc) => resourceIdsFiltrados.has(String(aipDoc.recursoId)))
		const aip = []

		for (const resource of dumpFiltrado.resources) {
			try {
				aip.push(await exportAipFiles(resource, config.storage.aipDir))
			} catch (err) {
				console.error(`[export] erro ao incluir AIP do recurso ${resource._id}:`, err)
				return jsonError(res, 500, {
					code: 'AIP_EXPORT_FAILED',
					message: `falha ao exportar ficheiros AIP do recurso ${resource._id}`,
				})
			}
		}

		res.setHeader('Content-Disposition', `attachment; filename="ew2026-export-${Date.now()}.json"`)
		res.setHeader('Content-Type', 'application/json')
		res.json({
			version: '2',
			exportedAt: new Date().toISOString(),
			filtersApplied: filtros,
			resources: dumpFiltrado.resources,
			aips: aipsFiltrados,
			news: dumpFiltrado.news,
			posts: dumpFiltrado.posts,
			ratings: dumpFiltrado.ratings,
			comments: dumpFiltrado.comments,
			aip,
		})
	} catch (err) {
		console.error('[export] erro:', err)
		jsonError(res, 500, 'erro interno ao exportar')
	}
}

module.exports.importAll = async (req, res) => {
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

	const filtros = construirFiltrosTransferencia(payload.filters || payload || req.query)

	if (!dump || dump.version !== '2') {
		return jsonError(res, 400, {
			code: 'INVALID_DUMP',
			message: 'dump inválido ou versão não suportada (esperado version: "2")',
		})
	}

	const results = {
		resources: { upserted: 0, errors: [] },
		news: { upserted: 0, errors: [] },
		posts: { upserted: 0, errors: [] },
		ratings: { upserted: 0, errors: [] },
		comments: { upserted: 0, errors: [] },
		aip: { restored: 0, errors: [] },
		aips: { upserted: 0, errors: [] },
	}

	const importedResourceIds = new Set()
	const dumpFiltrado = construirDumpFiltrado(dump, filtros)
	const resourceIdsFiltrados = new Set(dumpFiltrado.resources.map((resource) => String(resource._id)))
	const aipsFiltrados = Array.isArray(dump.aips)
		? dump.aips.filter((aipDoc) => resourceIdsFiltrados.has(String(aipDoc.recursoId)))
		: []

	async function upsertAll(Model, docs, key) {
		if (!Array.isArray(docs)) return

		for (const doc of docs) {
			try {
				const nextDoc = { ...doc }

				if (key === 'resources') {
					const resourceAipPath = buildResourceAipPath(config.storage.aipDir, doc._id)
					nextDoc.aipPath = resourceAipPath
					nextDoc.aipFile = buildStoredAipFile({
						resourceAipPath,
						originalName: doc.aipFile?.originalName,
						mimeType: doc.aipFile?.mimeType,
						size: doc.aipFile?.size,
					})
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

	async function restoreAllAip(resources, aipEntries) {
		if (!Array.isArray(resources) || !resources.length) return

		const entriesById = new Map(
			Array.isArray(aipEntries) ? aipEntries.map((entry) => [String(entry.resourceId), entry]) : []
		)

		for (const resource of resources) {
			const resourceId = String(resource._id)
			if (!importedResourceIds.has(resourceId)) continue

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
				await restoreAipFiles({
					aipDir: config.storage.aipDir,
					resourceId,
					files: entry.files,
				})
				results.aip.restored++
			} catch (err) {
				results.aip.errors.push({ id: resourceId, message: err.message })
			}
		}
	}

	await upsertAll(Resource, dumpFiltrado.resources, 'resources')
	await upsertAll(Aip, aipsFiltrados, 'aips')
	await upsertAll(NewsItem, dumpFiltrado.news, 'news')
	await upsertAll(Post, dumpFiltrado.posts, 'posts')
	await upsertAll(Rating, dumpFiltrado.ratings, 'ratings')
	await upsertAll(Comment, dumpFiltrado.comments, 'comments')
	await restoreAllAip(dumpFiltrado.resources, dumpFiltrado.aip)

	const totalErrors = Object.values(results).reduce((sum, result) => sum + result.errors.length, 0)

	res.status(totalErrors === 0 ? 200 : 207).json({
		ok: totalErrors === 0,
		filtersApplied: filtros,
		results,
	})
}
