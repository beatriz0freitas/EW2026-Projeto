const express = require('express')
const router = express.Router()

const User = require('../models/User')

// POST /auth/register
// Cria um novo utilizador. Nível por defeito: consumidor.
// Admin pode passar nivel=produtor|admin no body.
router.post('/', async (req, res) => {
	try {
		const { nome, email, password, nivel, filiacao } = req.body

		if (!nome || !email || !password) {
			return res.status(400).json({ ok: false, error: 'nome, email e password são obrigatórios' })
		}

		if (password.length < 6) {
			return res.status(400).json({ ok: false, error: 'password deve ter pelo menos 6 caracteres' })
		}

		// Apenas admins podem criar outros admins/produtores diretamente.
		// Por agora, registo público cria sempre consumidor.
		// (Quando a API estiver protegida, um admin pode PATCH /auth/users/:id para promover)
		const user = new User({
			nome,
			email,
			password,
			nivel: nivel || 'consumidor',
			filiacao: filiacao || {},
		})

		await user.save()

		res.status(201).json({ ok: true, user })
	} catch (err) {
		if (err.code === 11000) {
			return res.status(409).json({ ok: false, error: 'email já registado' })
		}
		console.error('[auth] register error:', err)
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// GET /auth/users  (admin: lista todos os utilizadores)
router.get('/', async (req, res) => {
	try {
		const users = await User.find().select('-password')
		res.json({ ok: true, users })
	} catch (err) {
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// PATCH /auth/users/:id  (admin: atualizar nivel ou dados)
router.patch('/:id', async (req, res) => {
	try {
		const allowed = ['nome', 'nivel', 'filiacao']
		const update = {}
		for (const key of allowed) {
			if (req.body[key] !== undefined) update[key] = req.body[key]
		}
		const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password')
		if (!user) return res.status(404).json({ ok: false, error: 'utilizador não encontrado' })
		res.json({ ok: true, user })
	} catch (err) {
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

module.exports = router