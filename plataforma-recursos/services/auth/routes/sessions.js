/**
 * routes/sessions.js
 *
 * POST /sessions          — login  (emite access token + refresh token em cookie HttpOnly)
 * GET  /sessions/verify   — valida access token (usado internamente pelos outros serviços)
 * POST /sessions/refresh  — troca o refresh token por um novo access token (sem novo login)
 * POST /sessions/logout   — invalida os dois cookies
 */

const express = require('express')

const sessionsController = require('../controllers/sessionsController')
const { verificaAcesso } = require('../middleware/auth')
const { requireInternalService } = require('../middleware/internal')
const { rateLimitLogin } = require('../middleware/rateLimit')
const { validarCampoObrigatorioNoBody, validarPedidoLoginNoBody } = require('../middleware/validate')

const router = express.Router()

// ─────────────────────────────────────────────
// POST /sessions  →  login
// ─────────────────────────────────────────────
router.post('/', rateLimitLogin, validarPedidoLoginNoBody(), sessionsController.login)

// ─────────────────────────────────────────────
// GET /sessions/verify  →  valida access token
// Usado internamente pelos outros serviços.
// ─────────────────────────────────────────────
router.get('/verify', verificaAcesso, sessionsController.verify)

// ─────────────────────────────────────────────
// POST /sessions/refresh  →  emite novo access token a partir do refresh token
// O refresh token é lido do cookie HttpOnly; nunca é enviado no body.
// ─────────────────────────────────────────────
router.post('/refresh', sessionsController.refresh)

// ─────────────────────────────────────────────
// POST /sessions/refresh-server  →  emite novo access token com refresh token no body
// Usado pelo serviço interface para renovação automática em server-side.
// Exige token interno entre serviços.
// ─────────────────────────────────────────────
router.post(
	'/refresh-server',
	requireInternalService,
	validarCampoObrigatorioNoBody('refreshToken', {
		status: 401,
		code: 'REFRESH_TOKEN_MISSING',
		message: 'refresh token ausente',
	}),
	sessionsController.refreshServer
)

// ─────────────────────────────────────────────
// POST /sessions/logout  →  limpa os dois cookies
// ─────────────────────────────────────────────
router.post('/logout', sessionsController.logout)

router.post('/oauth', sessionsController.oauthLogin)

module.exports = router
