const express = require('express')

const User = require('../models/User')
const { jsonError } = require('../lib/http')
const { config } = require('../lib/config')
const { buildAuthCookieOptions, extractAccessToken, signAccessToken, verifyAccessToken } = require('../lib/jwt')

const router = express.Router()

// POST /auth/sessions  →  login
// Body: { email, password }
// Devolve: { ok, token, user }
router.post('/', async (req, res) => {
	try {
		const { email, password } = req.body
		if (!email || !password) {
			return jsonError(res, 400, { code: 'INVALID_INPUT', message: 'email e password são obrigatórios' })
		}

		const user = await User.findOne({ email })
		if (!user) {
			return jsonError(res, 401, { code: 'INVALID_CREDENTIALS', message: 'credenciais inválidas' })
		}

		const valid = await user.checkPassword(password)
		if (!valid) {
			return jsonError(res, 401, { code: 'INVALID_CREDENTIALS', message: 'credenciais inválidas' })
		}

		// Atualizar dataUltimoAcesso sem disparar hooks
		await User.updateOne({ _id: user._id }, { dataUltimoAcesso: new Date() })

		const token = signAccessToken(user)

		// Compatível com o modo atual (token no JSON) e com cookies (modo browser).
		res.cookie(config.cookies.name, token, buildAuthCookieOptions())

		res.json({ ok: true, token, user })
	} catch (err) {
		console.error('[auth] login error:', err)
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// GET /auth/sessions/verify  →  valida token e devolve payload
// Usado internamente pelos outros serviços (API, Interface)
// Header: Authorization: Bearer <token>
router.get('/verify', (req, res) => {
	try {
		const token = extractAccessToken(req)

		if (!token) {
			return jsonError(res, 401, { code: 'TOKEN_MISSING', message: 'token ausente' })
		}

		const payload = verifyAccessToken(token)
		res.json({ ok: true, payload })
	} catch (err) {
		if (err.name === 'TokenExpiredError') {
			return jsonError(res, 401, { code: 'TOKEN_EXPIRED', message: 'token expirado' })
		}
		jsonError(res, 401, { code: 'INVALID_TOKEN', message: 'token inválido' })
	}
})

// POST /auth/sessions/logout  → limpa cookie de autenticação (modo browser)
router.post('/logout', (req, res) => {
	res.clearCookie(config.cookies.name, {
		domain: config.cookies.domain,
		path: config.cookies.path,
	})
	res.json({ ok: true })
})

module.exports = router