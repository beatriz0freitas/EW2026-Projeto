const express = require('express')

const Rating = require('../models/Rating')
const Resource = require('../models/Resource')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

// POST /api/resources/:id/ratings
router.post('/resources/:id/ratings', requireAuth, async (req, res) => {
	try {
		const stars = Number(req.body.stars)
		if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
			return res.status(400).json({ ok: false, error: 'stars deve ser inteiro entre 1 e 5' })
		}

		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return res.status(404).json({ ok: false, error: 'recurso não encontrado' })
		}

		const rating = await Rating.findOneAndUpdate(
			{ resourceId: resource._id, userId: req.user.sub },
			{ stars, updatedAt: new Date() },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		)

		res.status(201).json({ ok: true, rating })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'pedido inválido' })
	}
})

// GET /api/resources/:id/ratings
router.get('/resources/:id/ratings', async (req, res) => {
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) {
			return res.status(404).json({ ok: false, error: 'recurso não encontrado' })
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
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

module.exports = router

