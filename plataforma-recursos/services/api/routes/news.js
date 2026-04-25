const express = require('express')

const NewsItem = require('../models/NewsItem')
const { requireLevel } = require('../middleware/auth')
const { requireInternalService } = require('../middleware/internal')
const { publishNews } = require('../lib/newsPublisher')
const {
	validarCamposTextoObrigatoriosNoBody,
	validarPaginacaoNaQuery,
} = require('../middleware/validate')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

const router = express.Router()

// GET /api/news
router.get('/', validarPaginacaoNaQuery(), async (req, res) => {
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
router.post('/', requireLevel('admin'), validarCamposTextoObrigatoriosNoBody(['titulo', 'conteudo']), async (req, res) => {
	try {
		const { titulo, conteudo } = req.body

		const result = await publishNews({
			titulo,
			conteudo,
			tipo: 'manual',
			createdBy: req.user.sub,
		})

		res.status(201).json({ ok: true, item: result.item })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// POST /api/news/system (internal service only)
router.post('/system', requireInternalService, validarCamposTextoObrigatoriosNoBody(['titulo', 'conteudo', 'eventType']), async (req, res) => {
	try {
		const result = await publishNews({
			titulo: req.body.titulo,
			conteudo: req.body.conteudo,
			tipo: 'system',
			eventType: req.body.eventType,
			dedupeKey: req.body.dedupeKey,
			payload: req.body.payload,
			createdBy: req.body.createdBy || 'system',
			publicadoEm: req.body.publicadoEm,
		})

		res.status(result.created ? 201 : 200).json({
			ok: true,
			created: result.created,
			duplicated: result.duplicated,
			item: result.item,
		})
	} catch (err) {
		jsonError(res, 500, {
			code: 'SYSTEM_NEWS_ERROR',
			message: 'erro ao criar noticia do sistema',
		})
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

