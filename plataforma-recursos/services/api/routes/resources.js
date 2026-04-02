const express = require('express')

const Resource = require('../models/Resource')
const { optionalAuth, requireLevel } = require('../middleware/auth')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

const router = express.Router()

function buildFilters(query) {
	const filters = {}

	if (query.tipo) filters['metadata.resource.tipo'] = query.tipo
	if (query.ano) filters['metadata.resource.ano'] = Number(query.ano)
	if (query.tema) filters['metadata.resource.tema'] = query.tema
	if (query.hashtag) filters['metadata.resource.hashtags'] = query.hashtag

	return filters
}

function canManageResource(resource, user) {
	if (!user) return false
	if (user.nivel === 'admin') return true
	return String(resource.produtor) === String(user.sub)
}

// GET /api/resources
// Filtros: tipo, ano, tema, hashtag
// Paginação: page, limit
router.get('/', optionalAuth, async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)

		const filters = buildFilters(req.query)
		const [items, total] = await Promise.all([
			Resource.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
			Resource.countDocuments(filters),
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

// GET /api/resources/:id
router.get('/:id', optionalAuth, async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return jsonError(res, 404, 'recurso não encontrado')

		res.json({ ok: true, resource })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// PATCH /api/resources/:id
// Apenas admin ou produtor dono.
router.patch('/:id', requireLevel('produtor'), async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return jsonError(res, 404, 'recurso não encontrado')

		if (!canManageResource(resource, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		if (req.body.metadata && typeof req.body.metadata === 'object') {
			resource.metadata = req.body.metadata
		}

		await resource.save()
		res.json({ ok: true, resource })
	} catch (err) {
		jsonError(res, 400, 'pedido inválido')
	}
})

// DELETE /api/resources/:id
// Apenas admin ou produtor dono.
router.delete('/:id', requireLevel('produtor'), async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return jsonError(res, 404, 'recurso não encontrado')

		if (!canManageResource(resource, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		await Resource.deleteOne({ _id: resource._id })
		res.json({ ok: true })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

module.exports = router

