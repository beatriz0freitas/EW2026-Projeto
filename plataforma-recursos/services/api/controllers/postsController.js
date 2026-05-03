const Post = require('../models/Post')
const Resource = require('../models/Resource')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')
const {
	canViewResource,
	resourceAccessError,
	resourceSummary,
	visibilityQuery,
} = require('../lib/resourceAccess')

function canManagePost(post, user) {
	if (!user) return false
	if (user.role === 'admin') return true
	return String(post.autorId) === String(user.sub)
}

async function enrichPostsWithResources(posts) {
	const resourceIds = [...new Set(posts.map((post) => String(post.resourceId || '')).filter(Boolean))]
	const resources = resourceIds.length
		? await Resource.find({ _id: { $in: resourceIds } }).lean()
		: []
	const byId = new Map(resources.map((resource) => [String(resource._id), resource]))

	return posts.map((post) => ({
		...post,
		resource: resourceSummary(byId.get(String(post.resourceId))),
	}))
}

async function getAccessibleResourceIds(user) {
	const resources = await Resource.find(visibilityQuery(user)).select('_id').lean()
	return resources.map((resource) => resource._id)
}

module.exports.list = async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)
		const filters = {}

		if (req.query.resourceId !== undefined) {
			if (!isMongoId(req.query.resourceId)) {
				return invalidId(res)
			}

			const resource = await Resource.findById(req.query.resourceId)
			if (!resource) return jsonError(res, 404, 'resourceId inválido')
			if (!canViewResource(resource, req.user)) {
				const error = resourceAccessError(resource, req.user)
				return jsonError(res, error.status, error.body)
			}

			filters.resourceId = resource._id
		} else {
			filters.resourceId = { $in: await getAccessibleResourceIds(req.user) }
		}

		const [items, total] = await Promise.all([
			Post.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
			Post.countDocuments(filters),
		])

		res.json({
			ok: true,
			page,
			limit,
			total,
			totalPages: totalPages(total, limit),
			items: await enrichPostsWithResources(items),
		})
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.create = async (req, res) => {
	try {
		const { titulo, conteudo, resourceId } = req.body

		if (!isMongoId(resourceId)) {
			return invalidId(res)
		}

		const resource = await Resource.findById(resourceId)
		if (!resource) return jsonError(res, 404, 'resourceId inválido')
		if (!canViewResource(resource, req.user)) {
			const error = resourceAccessError(resource, req.user)
			return jsonError(res, error.status, error.body)
		}

		const post = await Post.create({
			titulo,
			conteudo,
			resourceId: resource._id,
			autorId: req.user.sub,
			autorNome: req.user.nome || '',
		})

		const postObject = post.toObject()
		res.status(201).json({ ok: true, post: { ...postObject, resource: resourceSummary(resource) } })
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.getById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id).lean()
		if (!post) return jsonError(res, 404, 'post não encontrado')

		const resource = await Resource.findById(post.resourceId)
		if (!resource) return jsonError(res, 404, 'recurso associado não encontrado')
		if (!canViewResource(resource, req.user)) {
			const error = resourceAccessError(resource, req.user)
			return jsonError(res, error.status, error.body)
		}

		res.json({ ok: true, post: { ...post, resource: resourceSummary(resource) } })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.patchById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		if (!canManagePost(post, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		if (req.body.titulo !== undefined) post.titulo = req.body.titulo
		if (req.body.conteudo !== undefined) post.conteudo = req.body.conteudo
		if (req.body.resourceId !== undefined) {
			if (!isMongoId(req.body.resourceId)) {
				return invalidId(res)
			}

			const resource = await Resource.findById(req.body.resourceId)
			if (!resource) return jsonError(res, 404, 'resourceId inválido')
			if (!canViewResource(resource, req.user)) {
				const error = resourceAccessError(resource, req.user)
				return jsonError(res, error.status, error.body)
			}

			post.resourceId = resource._id
		}
		post.updatedAt = new Date()

		await post.save()
		const resource = post.resourceId ? await Resource.findById(post.resourceId) : null
		res.json({ ok: true, post: { ...post.toObject(), resource: resourceSummary(resource) } })
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.deleteById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		const resource = await Resource.findById(post.resourceId)
		if (!resource) return jsonError(res, 404, 'recurso associado não encontrado')
		if (!canViewResource(resource, req.user)) {
			const error = resourceAccessError(resource, req.user)
			return jsonError(res, error.status, error.body)
		}

		if (!canManagePost(post, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		await Post.deleteOne({ _id: post._id })
		res.json({ ok: true })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
