const express = require('express')

const Post = require('../models/Post')
const Resource = require('../models/Resource')
const { requireLevel } = require('../middleware/auth')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')

const router = express.Router()

function canManagePost(post, user) {
	if (!user) return false
	if (user.nivel === 'admin') return true
	return String(post.autorId) === String(user.sub)
}

// GET /api/posts
router.get('/', async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)

		const [items, total] = await Promise.all([
			Post.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
			Post.countDocuments(),
		])

		res.json({ ok: true, page, limit, total, totalPages: totalPages(total, limit), items })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// POST /api/posts
router.post('/', requireLevel('produtor'), async (req, res) => {
	try {
		const { titulo, conteudo, resourceId } = req.body
		if (!titulo || !conteudo) {
			return jsonError(res, 400, 'titulo e conteudo são obrigatórios')
		}

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
	} catch (err) {
		jsonError(res, 400, 'pedido inválido')
	}
})

// GET /api/posts/:id
router.get('/:id', async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		res.json({ ok: true, post })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

// PATCH /api/posts/:id
router.patch('/:id', requireLevel('produtor'), async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		if (!canManagePost(post, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		if (req.body.titulo !== undefined) post.titulo = req.body.titulo
		if (req.body.conteudo !== undefined) post.conteudo = req.body.conteudo
		post.updatedAt = new Date()

		await post.save()
		res.json({ ok: true, post })
	} catch (err) {
		jsonError(res, 400, 'pedido inválido')
	}
})

// DELETE /api/posts/:id
router.delete('/:id', requireLevel('produtor'), async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const post = await Post.findById(req.params.id)
		if (!post) return jsonError(res, 404, 'post não encontrado')

		if (!canManagePost(post, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		await Post.deleteOne({ _id: post._id })
		res.json({ ok: true })
	} catch (err) {
		jsonError(res, 500, 'erro interno')
	}
})

module.exports = router

