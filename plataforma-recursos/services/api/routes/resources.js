const express = require('express')

const Resource = require('../models/Resource')
const { optionalAuth, requireLevel } = require('../middleware/auth')

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
		const page = Math.max(1, Number(req.query.page) || 1)
		const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
		const skip = (page - 1) * limit

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
			totalPages: Math.ceil(total / limit) || 1,
			items,
		})
	} catch (err) {
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// GET /api/resources/:id
router.get('/:id', optionalAuth, async (req, res) => {
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return res.status(404).json({ ok: false, error: 'recurso não encontrado' })

		res.json({ ok: true, resource })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

// PATCH /api/resources/:id
// Apenas admin ou produtor dono.
router.patch('/:id', requireLevel('produtor'), async (req, res) => {
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return res.status(404).json({ ok: false, error: 'recurso não encontrado' })

		if (!canManageResource(resource, req.user)) {
			return res.status(403).json({ ok: false, error: 'acesso negado' })
		}

		if (req.body.metadata && typeof req.body.metadata === 'object') {
			resource.metadata = req.body.metadata
		}

		await resource.save()
		res.json({ ok: true, resource })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'pedido inválido' })
	}
})

// DELETE /api/resources/:id
// Apenas admin ou produtor dono.
router.delete('/:id', requireLevel('produtor'), async (req, res) => {
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return res.status(404).json({ ok: false, error: 'recurso não encontrado' })

		if (!canManageResource(resource, req.user)) {
			return res.status(403).json({ ok: false, error: 'acesso negado' })
		}

		await Resource.deleteOne({ _id: resource._id })
		res.json({ ok: true })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

module.exports = router

