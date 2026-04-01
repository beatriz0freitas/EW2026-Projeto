const express = require('express')

const NewsItem = require('../models/NewsItem')
const { requireLevel } = require('../middleware/auth')

const router = express.Router()

// GET /api/news
router.get('/', async (req, res) => {
	try {
		const page = Math.max(1, Number(req.query.page) || 1)
		const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
		const skip = (page - 1) * limit

		const [items, total] = await Promise.all([
			NewsItem.find().sort({ publicadoEm: -1 }).skip(skip).limit(limit),
			NewsItem.countDocuments(),
		])

		res.json({
			ok: true,
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit) || 1,
			items,
		})
	} catch (err) {
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// POST /api/news (admin)
router.post('/', requireLevel('admin'), async (req, res) => {
	try {
		const { titulo, conteudo } = req.body
		if (!titulo || !conteudo) {
			return res.status(400).json({ ok: false, error: 'titulo e conteudo são obrigatórios' })
		}

		const item = await NewsItem.create({
			titulo,
			conteudo,
			createdBy: req.user.sub,
		})

		res.status(201).json({ ok: true, item })
	} catch (err) {
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// DELETE /api/news/:id (admin)
router.delete('/:id', requireLevel('admin'), async (req, res) => {
	try {
		const item = await NewsItem.findByIdAndDelete(req.params.id)
		if (!item) return res.status(404).json({ ok: false, error: 'notícia não encontrada' })

		res.json({ ok: true })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

module.exports = router

