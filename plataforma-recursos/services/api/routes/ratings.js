const express = require('express')

const Rating = require('../models/Rating')
const Resource = require('../models/Resource')
const { requireAuth } = require('../middleware/auth')
const { validarInteiroNoBody } = require('../middleware/validate')
const { jsonError, invalidId, isMongoId } = require('../lib/http')

const router = express.Router()

// POST /api/resources/:id/ratings
router.post('/resources/:id/ratings', requireAuth, validarInteiroNoBody('stars', { min: 1, max: 5 }), async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const stars = req.body.stars

		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return jsonError(res, 404, 'recurso não encontrado')
		}

		const rating = await Rating.findOneAndUpdate(
			{ resourceId: resource._id, userId: req.user.sub },
			{ stars, updatedAt: new Date() },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		)

		res.status(201).json({ ok: true, rating })
	} catch (err) {
		jsonError(res, 400, 'pedido inválido')
	}
})

// GET /api/resources/:id/ratings
router.get('/resources/:id/ratings', async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return jsonError(res, 404, 'recurso não encontrado')
		}

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
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// GET /api/resources/:id/ratings/mine
router.get('/resources/:id/ratings/mine', requireAuth, async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return jsonError(res, 404, 'recurso não encontrado')
		}

		const rating = await Rating.findOne({
			resourceId: resource._id,
			userId: req.user.sub,
		})

		res.json({ ok: true, rating: rating || null })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

module.exports = router

