const Resource = require('../models/Resource')
const NewsItem = require('../models/NewsItem')
const Post = require('../models/Post')
const Rating = require('../models/Rating')
const Comment = require('../models/Comment')
const { config } = require('../lib/config')
const { buildResourceAipPath, buildStoredAipFile, exportAipFiles, restoreAipFiles } = require('../lib/aipStorage')
const { jsonError } = require('../lib/http')

module.exports.exportAll = async (req, res) => {
	try {
		const [resources, news, posts, ratings, comments] = await Promise.all([
			Resource.find().lean(),
			NewsItem.find().lean(),
			Post.find().lean(),
			Rating.find().lean(),
			Comment.find().lean(),
		])
		const aip = []
		for (const resource of resources) {
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

		const dump = {
			version: '2',
			exportedAt: new Date().toISOString(),
			resources,
			news,
			posts,
			ratings,
			comments,
			aip,
		}

		res.setHeader('Content-Disposition', `attachment; filename="ew2026-export-${Date.now()}.json"`)
		res.setHeader('Content-Type', 'application/json')
		res.json(dump)
	} catch (err) {
		console.error('[export] erro:', err)
		jsonError(res, 500, 'erro interno ao exportar')
	}
}

module.exports.importAll = async (req, res) => {
	const dump = req.body

	if (!dump || !['1', '2'].includes(dump.version)) {
		return jsonError(res, 400, {
			code: 'INVALID_DUMP',
			message: 'dump inválido ou versão não suportada (esperado version: "1" ou "2")',
		})
	}

	const results = {
		resources: { upserted: 0, errors: [] },
		news: { upserted: 0, errors: [] },
		posts: { upserted: 0, errors: [] },
		ratings: { upserted: 0, errors: [] },
		comments: { upserted: 0, errors: [] },
		aip: { restored: 0, errors: [] },
	}
	const importedResourceIds = new Set()

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

		const entriesById = new Map(Array.isArray(aipEntries) ? aipEntries.map((entry) => [String(entry.resourceId), entry]) : [])

		for (const resource of resources) {
			const resourceId = String(resource._id)
			if (!importedResourceIds.has(resourceId)) continue
			const entry = entriesById.get(resourceId)

			if (!entry) {
				results.aip.errors.push({
					id: resourceId,
					message:
						dump.version === '2'
							? 'dump sem ficheiros AIP para este recurso'
							: 'dump versão 1 não inclui ficheiros AIP; restauro do disco não é possível',
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

	await upsertAll(Resource, dump.resources, 'resources')
	await upsertAll(NewsItem, dump.news, 'news')
	await upsertAll(Post, dump.posts, 'posts')
	await upsertAll(Rating, dump.ratings, 'ratings')
	await upsertAll(Comment, dump.comments, 'comments')
	await restoreAllAip(dump.resources, dump.aip)

	const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0)

	res.status(totalErrors === 0 ? 200 : 207).json({
		ok: totalErrors === 0,
		results,
	})
}
