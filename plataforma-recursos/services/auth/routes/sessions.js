const express = require('express')
const jwt = require('jsonwebtoken')

const User = require('../models/User')

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h'

// POST /auth/sessions  →  login
// Body: { email, password }
// Devolve: { ok, token, user }
router.post('/', async (req, res) => {
	try {
		const { email, password } = req.body
		if (!email || !password) {
			return res.status(400).json({ ok: false, error: 'email e password são obrigatórios' })
		}

		const user = await User.findOne({ email })
		if (!user) {
			return res.status(401).json({ ok: false, error: 'credenciais inválidas' })
		}

		const valid = await user.checkPassword(password)
		if (!valid) {
			return res.status(401).json({ ok: false, error: 'credenciais inválidas' })
		}

		// Atualizar dataUltimoAcesso sem disparar hooks
		await User.updateOne({ _id: user._id }, { dataUltimoAcesso: new Date() })

		const payload = {
			sub: String(user._id),
			email: user.email,
			nivel: user.nivel,
			nome: user.nome,
		}

		const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES })

		res.json({ ok: true, token, user })
	} catch (err) {
		console.error('[auth] login error:', err)
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// GET /auth/sessions/verify  →  valida token e devolve payload
// Usado internamente pelos outros serviços (API, Interface)
// Header: Authorization: Bearer <token>
router.get('/verify', (req, res) => {
	try {
		const authHeader = req.headers['authorization'] || ''
		const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

		if (!token) {
			return res.status(401).json({ ok: false, error: 'token ausente' })
		}

		const payload = jwt.verify(token, JWT_SECRET)
		res.json({ ok: true, payload })
	} catch (err) {
		if (err.name === 'TokenExpiredError') {
			return res.status(401).json({ ok: false, error: 'token expirado' })
		}
		res.status(401).json({ ok: false, error: 'token inválido' })
	}
})

module.exports = router