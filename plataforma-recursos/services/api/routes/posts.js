const express = require('express')

const Post = require('../models/Post')
const Resource = require('../models/Resource')
const { requireLevel } = require('../middleware/auth')

const router = express.Router()

function canManagePost(post, user) {
	if (!user) return false
	if (user.nivel === 'admin') return true
	return String(post.autorId) === String(user.sub)
}

// GET /api/posts
router.get('/', async (req, res) => {
	try {
		const page = Math.max(1, Number(req.query.page) || 1)
		const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
		const skip = (page - 1) * limit

		const [items, total] = await Promise.all([
			Post.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
			Post.countDocuments(),
		])

		res.json({ ok: true, page, limit, total, totalPages: Math.ceil(total / limit) || 1, items })
	} catch (err) {
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// POST /api/posts
router.post('/', requireLevel('produtor'), async (req, res) => {
	try {
		const { titulo, conteudo, resourceId } = req.body
		if (!titulo || !conteudo) {
			return res.status(400).json({ ok: false, error: 'titulo e conteudo são obrigatórios' })
		}

		if (resourceId) {
			const resource = await Resource.findById(resourceId)
			if (!resource) {
				return res.status(404).json({ ok: false, error: 'resourceId inválido' })
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
	} catch (err) {
		res.status(400).json({ ok: false, error: 'pedido inválido' })
	}
})

// GET /api/posts/:id
router.get('/:id', async (req, res) => {
	try {
		const post = await Post.findById(req.params.id)
		if (!post) return res.status(404).json({ ok: false, error: 'post não encontrado' })

		res.json({ ok: true, post })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

// PATCH /api/posts/:id
router.patch('/:id', requireLevel('produtor'), async (req, res) => {
	try {
		const post = await Post.findById(req.params.id)
		if (!post) return res.status(404).json({ ok: false, error: 'post não encontrado' })

		if (!canManagePost(post, req.user)) {
			return res.status(403).json({ ok: false, error: 'acesso negado' })
		}

		if (req.body.titulo !== undefined) post.titulo = req.body.titulo
		if (req.body.conteudo !== undefined) post.conteudo = req.body.conteudo
		post.updatedAt = new Date()

		await post.save()
		res.json({ ok: true, post })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'pedido inválido' })
	}
})

// DELETE /api/posts/:id
router.delete('/:id', requireLevel('produtor'), async (req, res) => {
	try {
		const post = await Post.findById(req.params.id)
		if (!post) return res.status(404).json({ ok: false, error: 'post não encontrado' })

		if (!canManagePost(post, req.user)) {
			return res.status(403).json({ ok: false, error: 'acesso negado' })
		}

		await Post.deleteOne({ _id: post._id })
		res.json({ ok: true })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

module.exports = router

