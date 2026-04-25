const NewsItem = require('../models/NewsItem')
const { publishNews } = require('../lib/newsPublisher')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

module.exports.list = async (req, res) => {
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
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.createManual = async (req, res) => {
	try {
		const { titulo, conteudo } = req.body

		const result = await publishNews({
			titulo,
			conteudo,
			tipo: 'manual',
			createdBy: req.user.sub,
		})

		res.status(201).json({ ok: true, item: result.item })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.createSystem = async (req, res) => {
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
	} catch {
		jsonError(res, 500, {
			code: 'SYSTEM_NEWS_ERROR',
			message: 'erro ao criar noticia do sistema',
		})
	}
}

module.exports.deleteById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const item = await NewsItem.findByIdAndDelete(req.params.id)
		if (!item) return jsonError(res, 404, 'notícia não encontrada')

		res.json({ ok: true })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
