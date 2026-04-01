const express = require('express')
const router = express.Router()

const usersRouter = require('./users')
const sessionsRouter = require('./sessions')
const { requireAuth } = require('../middleware/auth')

// POST /auth/register
router.use('/', usersRouter)

// POST /auth/sessions  (login)
// GET  /auth/sessions/verify
router.use('/sessions', sessionsRouter)

// GET /auth/me  →  atalho: valida token e devolve user completo do DB
const User = require('../models/User')
const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
	throw new Error('JWT_SECRET em falta. Define JWT_SECRET no ambiente para arrancar o serviço auth.')
}

router.get('/me', requireAuth, async (req, res) => {
	try {
		const user = await User.findById(req.user.sub).select('-password')
		if (!user) return res.status(404).json({ ok: false, error: 'utilizador não encontrado' })

		await User.updateOne({ _id: user._id }, { dataUltimoAcesso: new Date() })

		res.json({ ok: true, user })
	} catch (err) {
		res.status(401).json({ ok: false, error: 'token inválido ou expirado' })
	}
})

module.exports = router