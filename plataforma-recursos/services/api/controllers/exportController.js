const Resource = require('../models/Resource')
const NewsItem = require('../models/NewsItem')
const Rating = require('../models/Rating')
const Comment = require('../models/Comment')
const { jsonError } = require('../lib/http')

module.exports.exportAll = async (req, res) => {
	try {
		const [resources, news, ratings, comments] = await Promise.all([
			Resource.find().lean(),
			NewsItem.find().lean(),
			Rating.find().lean(),
			Comment.find().lean(),
		])

		const dump = {
			version: '1',
			exportedAt: new Date().toISOString(),
			resources,
			news,
			ratings,
			comments,
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

	if (!dump || dump.version !== '1') {
		return jsonError(res, 400, {
			code: 'INVALID_DUMP',
			message: 'dump inválido ou versão não suportada (esperado version: "1")',
		})
	}

	const results = {
		resources: { upserted: 0, errors: [] },
		news: { upserted: 0, errors: [] },
		ratings: { upserted: 0, errors: [] },
		comments: { upserted: 0, errors: [] },
	}

	async function upsertAll(Model, docs, key) {
		if (!Array.isArray(docs)) return
		for (const doc of docs) {
			try {
				await Model.findByIdAndUpdate(doc._id, { $set: doc }, { upsert: true, new: true })
				results[key].upserted++
			} catch (err) {
				results[key].errors.push({ id: String(doc._id), message: err.message })
			}
		}
	}

	await upsertAll(Resource, dump.resources, 'resources')
	await upsertAll(NewsItem, dump.news, 'news')
	await upsertAll(Rating, dump.ratings, 'ratings')
	await upsertAll(Comment, dump.comments, 'comments')

	const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0)

	res.status(totalErrors === 0 ? 200 : 207).json({
		ok: totalErrors === 0,
		results,
	})
}
