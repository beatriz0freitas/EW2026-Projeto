const express = require('express')
const router = express.Router()

const usersRouter = require('./users')
const sessionsRouter = require('./sessions')
const { requireAuth } = require('../middleware/auth')
const { jsonError } = require('../lib/http')

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
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador não encontrado' })

		await User.updateOne({ _id: user._id }, { dataUltimoAcesso: new Date() })

		res.json({ ok: true, user })
	} catch (err) {
		jsonError(res, 401, { code: 'INVALID_TOKEN', message: 'token inválido ou expirado' })
	}
})

module.exports = router