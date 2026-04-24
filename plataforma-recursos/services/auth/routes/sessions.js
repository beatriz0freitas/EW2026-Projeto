/**
 * routes/sessions.js
 *
 * POST /sessions          — login  (emite access token + refresh token em cookie HttpOnly)
 * GET  /sessions/verify   — valida access token (usado internamente pelos outros serviços)
 * POST /sessions/refresh  — troca o refresh token por um novo access token (sem novo login)
 * POST /sessions/logout   — invalida os dois cookies
 */

const express = require('express')

const UserCtrl = require('../controllers/user')
const User = require('../models/User')
const auth = require('../auth/auth')
const { jsonError } = require('../lib/http')
const { config } = require('../lib/config')
const { validarCampoObrigatorioNoBody, validarPedidoLoginNoBody } = require('../middleware/validate')
const {
	signAccessToken,
	signRefreshToken,
	verifyRefreshToken,
	buildAuthCookieOptions,
	buildRefreshCookieOptions,
	REFRESH_COOKIE,
} = require('../lib/jwt')

const router = express.Router()

// ─────────────────────────────────────────────
// POST /sessions  →  login
// ─────────────────────────────────────────────
router.post('/', validarPedidoLoginNoBody(), async (req, res) => {
	try {
		const { email, username, password } = req.body
		const identifier = email || username

		const dados = await UserCtrl.login(identifier, password)

		// Emitir refresh token em cookie HttpOnly separado
		const refreshToken = signRefreshToken(dados.user)
		res.cookie(REFRESH_COOKIE, refreshToken, buildRefreshCookieOptions())

		// Access token no cookie normal (modo browser) e no JSON (modo API)
		res.cookie(config.cookies.name, dados.token, buildAuthCookieOptions())
		res.json({ ok: true, token: dados.token, refreshToken, user: dados.user })
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

// ─────────────────────────────────────────────
// GET /sessions/verify  →  valida access token
// Usado internamente pelos outros serviços.
// ─────────────────────────────────────────────
router.get('/verify', auth.verificaAcesso, (req, res) => {
	res.json({ ok: true, payload: req.user })
})

// ─────────────────────────────────────────────
// POST /sessions/refresh  →  emite novo access token a partir do refresh token
// O refresh token é lido do cookie HttpOnly; nunca é enviado no body.
// ─────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
	const refreshToken = req.cookies?.[REFRESH_COOKIE]
	if (!refreshToken) {
		return jsonError(res, 401, { code: 'REFRESH_TOKEN_MISSING', message: 'refresh token ausente' })
	}

	let payload
	try {
		payload = verifyRefreshToken(refreshToken)
	} catch {
		return jsonError(res, 401, { code: 'REFRESH_TOKEN_INVALID', message: 'refresh token inválido ou expirado' })
	}

	// Garantir que o utilizador ainda existe e está ativo
	const user = await User.findById(payload.sub)
	if (!user || !user.ativo) {
		return jsonError(res, 401, { code: 'ACCOUNT_DISABLED', message: 'conta inexistente ou desativada' })
	}

	// Emitir novo access token
	const newAccessToken = signAccessToken(user)
	res.cookie(config.cookies.name, newAccessToken, buildAuthCookieOptions())

	res.json({ ok: true, token: newAccessToken })
})

// ─────────────────────────────────────────────
// POST /sessions/refresh-server  →  emite novo access token com refresh token no body
// Usado pelo serviço interface para renovação automática em server-side.
// ─────────────────────────────────────────────
router.post(
	'/refresh-server',
	validarCampoObrigatorioNoBody('refreshToken', {
		status: 401,
		code: 'REFRESH_TOKEN_MISSING',
		message: 'refresh token ausente',
	}),
	async (req, res) => {
	const refreshToken = req.body?.refreshToken

	let payload
	try {
		payload = verifyRefreshToken(refreshToken)
	} catch {
		return jsonError(res, 401, { code: 'REFRESH_TOKEN_INVALID', message: 'refresh token inválido ou expirado' })
	}

	const user = await User.findById(payload.sub)
	if (!user || !user.ativo) {
		return jsonError(res, 401, { code: 'ACCOUNT_DISABLED', message: 'conta inexistente ou desativada' })
	}

	const newAccessToken = signAccessToken(user)
	res.json({ ok: true, token: newAccessToken })
})

// ─────────────────────────────────────────────
// POST /sessions/logout  →  limpa os dois cookies
// ─────────────────────────────────────────────
router.post('/logout', (req, res) => {
	res.clearCookie(config.cookies.name, {
		domain: config.cookies?.domain,
		path:   config.cookies?.path || '/',
	})
	res.clearCookie(REFRESH_COOKIE, {
		domain: config.cookies?.domain,
		path:   '/sessions/refresh',
	})
	res.json({ ok: true })
})

module.exports = router