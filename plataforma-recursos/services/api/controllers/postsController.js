const Post = require('../models/Post')
const Resource = require('../models/Resource')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

function canManagePost(post, user) {
	if (!user) return false
	if (user.role === 'admin') return true
	return String(post.autorId) === String(user.sub)
}

module.exports.list = async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)
		const filters = {}

		if (req.query.resourceId !== undefined) {
			if (!isMongoId(req.query.resourceId)) {
				return invalidId(res)
			}
			filters.resourceId = req.query.resourceId
		}

		const [items, total] = await Promise.all([
			Post.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
			Post.countDocuments(filters),
		])

		res.json({ ok: true, page, limit, total, totalPages: totalPages(total, limit), items })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.create = async (req, res) => {
	try {
		const { titulo, conteudo, resourceId } = req.body

		if (resourceId) {
			if (!isMongoId(resourceId)) {
				return invalidId(res)
			}

			const resource = await Resource.findById(resourceId)
			if (!resource) {
				return jsonError(res, 404, 'resourceId inválido')
			}
		}

		const post = await Post.create({
			titulo,
			conteudo,
			resourceId: resourceId || null,
			autorId: req.user.sub,
			autorNome: req.user.nome || '',
		})

		res.status(201).json({ ok: true, post })
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.getById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		res.json({ ok: true, post })
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
			if (req.body.resourceId === null || req.body.resourceId === '') {
				post.resourceId = null
			} else {
				if (!isMongoId(req.body.resourceId)) {
					return invalidId(res)
				}

				const resource = await Resource.findById(req.body.resourceId)
				if (!resource) {
					return jsonError(res, 404, 'resourceId inválido')
				}

				post.resourceId = req.body.resourceId
			}
		}
		post.updatedAt = new Date()

		await post.save()
		res.json({ ok: true, post })
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.deleteById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		if (!canManagePost(post, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		await Post.deleteOne({ _id: post._id })
		res.json({ ok: true })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
