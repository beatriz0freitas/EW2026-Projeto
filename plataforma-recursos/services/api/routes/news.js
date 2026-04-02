const express = require('express')

const NewsItem = require('../models/NewsItem')
const { requireLevel } = require('../middleware/auth')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

const router = express.Router()

// GET /api/news
router.get('/', async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)

		const [items, total] = await Promise.all([
			NewsItem.find().sort({ publicadoEm: -1 }).skip(skip).limit(limit),
			NewsItem.countDocuments(),
		])

		res.json({
			ok: true,
			page,
			limit,
			total,
			totalPages: totalPages(total, limit),
			items,
		})
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// POST /api/news (admin)
router.post('/', requireLevel('admin'), async (req, res) => {
	try {
		const { titulo, conteudo } = req.body
		if (!titulo || !conteudo) {
			return jsonError(res, 400, 'titulo e conteudo são obrigatórios')
		}

		const item = await NewsItem.create({
			titulo,
			conteudo,
			createdBy: req.user.sub,
		})

		res.status(201).json({ ok: true, item })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// DELETE /api/news/:id (admin)
router.delete('/:id', requireLevel('admin'), async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const item = await NewsItem.findByIdAndDelete(req.params.id)
		if (!item) return jsonError(res, 404, 'notícia não encontrada')

		res.json({ ok: true })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

module.exports = router

