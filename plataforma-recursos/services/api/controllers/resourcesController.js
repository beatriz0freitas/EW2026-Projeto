const fsp = require('fs/promises')
const Resource = require('../models/Resource')
const Post = require('../models/Post')
const Rating = require('../models/Rating')
const Comment = require('../models/Comment')
const { config } = require('../lib/config')
const { resolveResourceAipPath } = require('../lib/aipStorage')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

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
	if (user.role === 'admin') return true
	return String(resource.produtor) === String(user.sub)
}

function canViewResource(resource, user) {
	const visibilidade = resource?.metadata?.resource?.visibilidade || 'privado'
	if (visibilidade !== 'privado') return true
	if (!user) return false
	if (user.role === 'admin') return true
	return String(resource.produtor) === String(user.sub)
}

function visibilityQuery(user) {
	if (!user) return { 'metadata.resource.visibilidade': 'publico' }
	if (user.role === 'admin') return {}
	return {
		$or: [{ 'metadata.resource.visibilidade': 'publico' }, { produtor: String(user.sub) }],
	}
}

module.exports.list = async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)
		const filters = { ...buildFilters(req.query), ...visibilityQuery(req.user) }
		const [items, total] = await Promise.all([
			Resource.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
			Resource.countDocuments(filters),
		])
		res.json({ ok: true, page, limit, total, totalPages: totalPages(total, limit), items })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.getById = async (req, res) => {
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
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.patchById = async (req, res) => {
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
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.deleteById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return jsonError(res, 404, 'recurso não encontrado')
		if (!canManageResource(resource, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		const resourceDir = resolveResourceAipPath(resource, config.storage.aipDir)
		try {
			await fsp.rm(resourceDir, { recursive: true, force: true })
		} catch (fsErr) {
			console.error(`[resources] erro: não foi possível apagar AIP em disco: ${resourceDir}`, fsErr)
			return jsonError(res, 500, {
				code: 'AIP_DELETE_FAILED',
				message: 'não foi possível apagar o recurso em disco',
			})
		}

		const posts = await Post.find({ resourceId: resource._id }).select('_id').lean()
		const postIds = posts.map((post) => post._id)

		await Promise.all([
			Resource.deleteOne({ _id: resource._id }),
			Rating.deleteMany({ resourceId: resource._id }),
			Post.deleteMany({ resourceId: resource._id }),
			postIds.length ? Comment.deleteMany({ postId: { $in: postIds } }) : Promise.resolve(),
		])

		res.json({ ok: true })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
