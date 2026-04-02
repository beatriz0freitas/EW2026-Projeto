const express = require('express')
const router = express.Router()

const User = require('../models/User')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { jsonError } = require('../lib/http')

const NIVEIS = ['admin', 'produtor', 'consumidor']
const UPDATABLE_FIELDS = ['nome', 'nivel', 'filiacao']

function validateRegistrationInput({ nome, email, password }) {
	if (!nome || !email || !password) {
		return 'nome, email e password são obrigatórios'
	}

	if (password.length < 6) {
		return 'password deve ter pelo menos 6 caracteres'
	}

	return null
}

function buildAdminUpdate(body) {
	const update = {}

	for (const key of UPDATABLE_FIELDS) {
		if (body[key] !== undefined) update[key] = body[key]
	}

	return update
}

// POST /auth/register
// Cria um novo utilizador. Nível por defeito: consumidor.
// Admin pode passar nivel=produtor|admin no body.
router.post('/register', async (req, res) => {
	try {
		const { nome, email, password, filiacao } = req.body
		const validationError = validateRegistrationInput({ nome, email, password })

		if (validationError) {
			return jsonError(res, 400, { code: 'INVALID_INPUT', message: validationError })
		}

		// Apenas admins podem criar outros admins/produtores diretamente.
		// Por agora, registo público cria sempre consumidor.
		// (Quando a API estiver protegida, um admin pode PATCH /auth/users/:id para promover)
		const user = new User({
			nome,
			email,
			password,
			nivel: 'consumidor',
			filiacao: filiacao || {},
		})

		await user.save()

		res.status(201).json({ ok: true, user })
	} catch (err) {
		if (err.code === 11000) {
			return jsonError(res, 409, { code: 'DUPLICATE_EMAIL', message: 'email já registado' })
		}
		console.error('[auth] register error:', err)
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// GET /auth/users  (admin: lista todos os utilizadores)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
	try {
		const users = await User.find().select('-password')
		res.json({ ok: true, users })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// PATCH /auth/users/:id  (admin: atualizar nivel ou dados)
router.patch('/users/:id', requireAuth, requireAdmin, async (req, res) => {
	try {
		const update = buildAdminUpdate(req.body)

		if (update.nivel && !NIVEIS.includes(update.nivel)) {
			return jsonError(res, 400, { code: 'INVALID_LEVEL', message: 'nivel inválido' })
		}

		const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password')
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador não encontrado' })
		res.json({ ok: true, user })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// DELETE /auth/users/:id  (admin: remover utilizador)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
	try {
		if (String(req.user.sub) === String(req.params.id)) {
			return jsonError(res, 400, {
				code: 'SELF_DELETE_FORBIDDEN',
				message: 'não podes remover o teu próprio utilizador',
			})
		}

		const user = await User.findByIdAndDelete(req.params.id).select('-password')
		if (!user) {
			return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador não encontrado' })
		}

		res.json({ ok: true, user })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

module.exports = router