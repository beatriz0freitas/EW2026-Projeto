const Rating = require('../models/Rating')
const Resource = require('../models/Resource')
const { jsonError, invalidId, isMongoId } = require('../lib/http')
const { publishTop3NewsIfChanged } = require('../jobs/systemNews')
const { canViewResource, resourceAccessError } = require('../lib/resourceAccess')

function ensureResourceVisible(resource, user, res) {
	if (canViewResource(resource, user)) return true
	const error = resourceAccessError(resource, user)
	jsonError(res, error.status, error.body)
	return false
}

module.exports.upsertByResource = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const stars = req.body.stars

		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return jsonError(res, 404, 'recurso não encontrado')
		}
		if (!ensureResourceVisible(resource, req.user, res)) return

		const rating = await Rating.findOneAndUpdate(
			{ resourceId: resource._id, userId: req.user.sub },
			{ stars, updatedAt: new Date() },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		)

		publishTop3NewsIfChanged().catch((err) => {
			console.error('[api][ratings] warning: could not publish top3 news after rating update:', err)
		})

		res.status(201).json({ ok: true, rating })
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.getStatsByResource = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return jsonError(res, 404, 'recurso não encontrado')
		}
		if (!ensureResourceVisible(resource, req.user, res)) return

		const stats = await Rating.aggregate([
			{ $match: { resourceId: resource._id } },
			{
				$group: {
					_id: '$resourceId',
					media: { $avg: '$stars' },
					total: { $sum: 1 },
				},
			},
		])

		if (!stats.length) {
			return res.json({ ok: true, media: 0, total: 0 })
		}

		res.json({ ok: true, media: Number(stats[0].media.toFixed(2)), total: stats[0].total })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.getMineByResource = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return jsonError(res, 404, 'recurso não encontrado')
		}
		if (!ensureResourceVisible(resource, req.user, res)) return

		const rating = await Rating.findOne({
			resourceId: resource._id,
			userId: req.user.sub,
		})

		res.json({ ok: true, rating: rating || null })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
