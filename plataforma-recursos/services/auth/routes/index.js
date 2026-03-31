const express = require('express')
const router = express.Router()

const usersRouter = require('./users')
const sessionsRouter = require('./sessions')

// POST /auth/register
router.use('/register', usersRouter)

// POST /auth/sessions  (login)
// GET  /auth/sessions/verify
router.use('/sessions', sessionsRouter)

// GET /auth/me  →  atalho: valida token e devolve user completo do DB
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

router.get('/me', async (req, res) => {
	try {
		const authHeader = req.headers['authorization'] || ''
		const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
		if (!token) return res.status(401).json({ ok: false, error: 'token ausente' })

		const payload = jwt.verify(token, JWT_SECRET)
		const user = await User.findById(payload.sub).select('-password')
		if (!user) return res.status(404).json({ ok: false, error: 'utilizador não encontrado' })

		await User.updateOne({ _id: user._id }, { dataUltimoAcesso: new Date() })

		res.json({ ok: true, user })
	} catch (err) {
		res.status(401).json({ ok: false, error: 'token inválido ou expirado' })
	}
})

// GET /auth/users  (admin)
// PATCH /auth/users/:id  (admin)
router.use('/users', usersRouter)

module.exports = router