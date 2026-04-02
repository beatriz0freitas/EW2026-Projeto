const express = require('express')

const Post = require('../models/Post')
const Comment = require('../models/Comment')
const { requireAuth } = require('../middleware/auth')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

const router = express.Router()

function canDeleteComment(comment, user) {
	if (!user) return false
	if (user.nivel === 'admin') return true
	return String(comment.autorId) === String(user.sub)
}

// GET /api/posts/:id/comments
router.get('/posts/:id/comments', async (req, res) => {
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
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// POST /api/posts/:id/comments
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		if (!req.body.texto) {
			return jsonError(res, 400, 'texto é obrigatório')
		}

		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		const comment = await Comment.create({
			postId: post._id,
			autorId: req.user.sub,
			autorNome: req.user.nome || '',
			texto: req.body.texto,
		})

		res.status(201).json({ ok: true, comment })
	} catch (err) {
		jsonError(res, 400, 'pedido inválido')
	}
})

// DELETE /api/posts/:id/comments/:cid
router.delete('/posts/:id/comments/:cid', requireAuth, async (req, res) => {
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
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

module.exports = router

