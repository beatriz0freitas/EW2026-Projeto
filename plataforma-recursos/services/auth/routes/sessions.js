const express = require('express')

const User = require('../controllers/user')
const auth = require('../auth/auth')
const { jsonError } = require('../lib/http')
const { config } = require('../lib/config')
const { buildAuthCookieOptions } = require('../lib/jwt')

const router = express.Router()

// POST /auth/sessions  →  login
// Body: { email, password }
// Devolve: { ok, token, user }
router.post('/', async (req, res) => {
	try {
		const { email, username, password } = req.body
		const identifier = email || username
		if (!identifier || !password) {
			return jsonError(res, 400, {
				code: 'INVALID_INPUT',
				message: 'email/username e password sao obrigatorios',
			})
		}

		const dados = await User.login(identifier, password)

		// Compatível com o modo atual (token no JSON) e com cookies (modo browser).
		res.cookie(config.cookies.name, dados.token, buildAuthCookieOptions())

		res.json({ ok: true, token: dados.token, user: dados.user })
	} catch (err) {
		const msg = String(err?.message || '').toLowerCase()
		if (msg.includes('desativada')) {
			return jsonError(res, 403, { code: 'ACCOUNT_DISABLED', message: 'conta desativada' })
		}
		if (msg.includes('nao encontrado') || msg.includes('incorreta') || msg.includes('invalidas')) {
			return jsonError(res, 401, { code: 'INVALID_CREDENTIALS', message: 'credenciais invalidas' })
		}
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// GET /auth/sessions/verify  →  valida token e devolve payload
// Usado internamente pelos outros serviços (API, Interface)
// Header: Authorization: Bearer <token>
router.get('/verify', auth.verificaAcesso, (req, res) => {
	res.json({ ok: true, payload: req.user })
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