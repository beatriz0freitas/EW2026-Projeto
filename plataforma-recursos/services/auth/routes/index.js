const express = require('express')
const router = express.Router()

const usersRouter = require('./users')
const sessionsRouter = require('./sessions')
const auth = require('../auth/auth')
const { jsonError } = require('../lib/http')

// POST /auth/register
router.use('/', usersRouter)

// POST /auth/sessions  (login)
// GET  /auth/sessions/verify
router.use('/sessions', sessionsRouter)

// GET /auth/me  →  atalho: valida token e devolve user completo do DB
const User = require('../models/User')

router.get('/me', auth.verificaAcesso, async (req, res) => {
	try {
		const user = await User.findById(req.user.sub).select('-password')
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador não encontrado' })

		await User.updateOne({ _id: user._id }, { ultimo_acesso: new Date() })

		res.json({ ok: true, user })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

module.exports = router