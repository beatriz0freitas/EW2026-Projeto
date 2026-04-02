const express = require('express')
const jwt = require('jsonwebtoken')

const User = require('../models/User')
const { jsonError } = require('../lib/http')

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h'

if (!JWT_SECRET) {
	throw new Error('JWT_SECRET em falta. Define JWT_SECRET no ambiente para arrancar o serviço auth.')
}

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
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
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
			return jsonError(res, 401, { code: 'TOKEN_MISSING', message: 'token ausente' })
		}

		const payload = jwt.verify(token, JWT_SECRET)
		res.json({ ok: true, payload })
	} catch (err) {
		if (err.name === 'TokenExpiredError') {
			return jsonError(res, 401, { code: 'TOKEN_EXPIRED', message: 'token expirado' })
		}
		jsonError(res, 401, { code: 'INVALID_TOKEN', message: 'token inválido' })
	}
})

module.exports = router