const express = require('express')

const Post = require('../models/Post')
const Comment = require('../models/Comment')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

function canDeleteComment(comment, user) {
	if (!user) return false
	if (user.nivel === 'admin') return true
	return String(comment.autorId) === String(user.sub)
}

// GET /api/posts/:id/comments
router.get('/posts/:id/comments', async (req, res) => {
	try {
		const post = await Post.findById(req.params.id)
		if (!post) return res.status(404).json({ ok: false, error: 'post não encontrado' })

		const page = Math.max(1, Number(req.query.page) || 1)
		const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
		const skip = (page - 1) * limit

		const [items, total] = await Promise.all([
			Comment.find({ postId: post._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
			Comment.countDocuments({ postId: post._id }),
		])

		res.json({ ok: true, page, limit, total, totalPages: Math.ceil(total / limit) || 1, items })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

// POST /api/posts/:id/comments
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
	try {
		if (!req.body.texto) {
			return res.status(400).json({ ok: false, error: 'texto é obrigatório' })
		}

		const post = await Post.findById(req.params.id)
		if (!post) return res.status(404).json({ ok: false, error: 'post não encontrado' })

		const comment = await Comment.create({
			postId: post._id,
			autorId: req.user.sub,
			autorNome: req.user.nome || '',
			texto: req.body.texto,
		})

		res.status(201).json({ ok: true, comment })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'pedido inválido' })
	}
})

// DELETE /api/posts/:id/comments/:cid
router.delete('/posts/:id/comments/:cid', requireAuth, async (req, res) => {
	try {
		const post = await Post.findById(req.params.id)
		if (!post) return res.status(404).json({ ok: false, error: 'post não encontrado' })

		const comment = await Comment.findOne({ _id: req.params.cid, postId: post._id })
		if (!comment) return res.status(404).json({ ok: false, error: 'comentário não encontrado' })

		if (!canDeleteComment(comment, req.user)) {
			return res.status(403).json({ ok: false, error: 'acesso negado' })
		}

		await Comment.deleteOne({ _id: comment._id })
		res.json({ ok: true })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

module.exports = router

