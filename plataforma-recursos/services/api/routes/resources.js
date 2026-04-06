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

function canViewResource(resource, user) {
	const visibilidade = resource?.metadata?.resource?.visibilidade || 'privado'
	if (visibilidade !== 'privado') return true
	if (!user) return false
	if (user.nivel === 'admin') return true
	return String(resource.produtor) === String(user.sub)
}

function visibilityQuery(user) {
	// Por omissão, recursos sem visibilidade são tratados como privados.
	if (!user) {
		return { 'metadata.resource.visibilidade': 'publico' }
	}

	if (user.nivel === 'admin') {
		return {}
	}

	return {
		$or: [{ 'metadata.resource.visibilidade': 'publico' }, { produtor: String(user.sub) }],
	}
}

// GET /api/resources
// Filtros: tipo, ano, tema, hashtag
// Paginação: page, limit
router.get('/', optionalAuth, async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)

		const filters = {
			...buildFilters(req.query),
			...visibilityQuery(req.user),
		}
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

		if (!canViewResource(resource, req.user)) {
			const visibilidade = resource?.metadata?.resource?.visibilidade || 'privado'
			if (visibilidade === 'privado' && !req.user) {
				return jsonError(res, 401, { code: 'AUTH_REQUIRED', message: 'autenticação necessária para recursos privados' })
			}
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'acesso negado' })
		}

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

