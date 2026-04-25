const Post = require('../models/Post')
const Comment = require('../models/Comment')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

function canDeleteComment(comment, user) {
	if (!user) return false
	if (user.role === 'admin') return true
	return String(comment.autorId) === String(user.sub)
}

module.exports.listByPost = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

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
