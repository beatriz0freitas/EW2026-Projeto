const Post = require('../models/Post')
const Comment = require('../models/Comment')
const Resource = require('../models/Resource')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')
const { canViewResource, resourceAccessError } = require('../lib/resourceAccess')

function canDeleteComment(comment, user) {
	if (!user) return false
	if (user.role === 'admin') return true
	return String(comment.autorId) === String(user.sub)
}

async function ensurePostResourceVisible(post, user, res) {
	const resource = await Resource.findById(post.resourceId)
	if (!resource) {
		jsonError(res, 404, 'recurso associado não encontrado')
		return false
	}
	if (!canViewResource(resource, user)) {
		const error = resourceAccessError(resource, user)
		jsonError(res, error.status, error.body)
		return false
	}
	return true
}

module.exports.listByPost = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')
		if (!(await ensurePostResourceVisible(post, req.user, res))) return

		const { page, limit, skip } = getPagination(req.query, { defaultLimit: 20 })

		const [items, total] = await Promise.all([
			Comment.find({ postId: post._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
			Comment.countDocuments({ postId: post._id }),
		])

		res.json({ ok: true, page, limit, total, totalPages: totalPages(total, limit), items })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.createByPost = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')
		if (!(await ensurePostResourceVisible(post, req.user, res))) return

		const comment = await Comment.create({
			postId: post._id,
			autorId: req.user.sub,
			autorNome: req.user.nome || '',
			texto: req.body.texto,
		})

		res.status(201).json({ ok: true, comment })
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.deleteByPost = async (req, res) => {
	if (!isMongoId(req.params.id) || !isMongoId(req.params.cid)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')
		if (!(await ensurePostResourceVisible(post, req.user, res))) return

		const comment = await Comment.findOne({ _id: req.params.cid, postId: post._id })
		if (!comment) return jsonError(res, 404, 'comentário não encontrado')

		if (!canDeleteComment(comment, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		await Comment.deleteOne({ _id: comment._id })
		res.json({ ok: true })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
