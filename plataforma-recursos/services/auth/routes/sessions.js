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
const auth = require('../auth/auth')
const { validarCampoObrigatorioNoBody, validarPedidoLoginNoBody } = require('../middleware/validate')

const router = express.Router()

// ─────────────────────────────────────────────
// POST /sessions  →  login
// ─────────────────────────────────────────────
router.post('/', validarPedidoLoginNoBody(), sessionsController.login)

// ─────────────────────────────────────────────
// GET /sessions/verify  →  valida access token
// Usado internamente pelos outros serviços.
// ─────────────────────────────────────────────
router.get('/verify', auth.verificaAcesso, sessionsController.verify)

// ─────────────────────────────────────────────
// POST /sessions/refresh  →  emite novo access token a partir do refresh token
// O refresh token é lido do cookie HttpOnly; nunca é enviado no body.
// ─────────────────────────────────────────────
router.post('/refresh', sessionsController.refresh)

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
	sessionsController.refreshServer
)

// ─────────────────────────────────────────────
// POST /sessions/logout  →  limpa os dois cookies
// ─────────────────────────────────────────────
router.post('/logout', sessionsController.logout)

module.exports = router