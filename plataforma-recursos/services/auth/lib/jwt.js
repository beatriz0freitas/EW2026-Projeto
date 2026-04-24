/**
 * lib/jwt.js
 *
 * Gere dois tipos de token:
 *   • Access token  — curta duração (15 min por omissão), enviado em cada pedido
 *   • Refresh token — longa duração (7 dias por omissão), usado só para renovar o access token
 *
 * O refresh token é guardado apenas em cookie HttpOnly; nunca é exposto no JSON da resposta.
 */

const jwt = require('jsonwebtoken')
const { config } = require('./config')

// ─── Segredos ────────────────────────────────────────────────────────────────
// Devem ser variáveis de ambiente distintas em produção.
const ACCESS_SECRET = config.jwt.accessSecret
const REFRESH_SECRET = config.jwt.refreshSecret

const ACCESS_TTL = config.jwt.accessTtl
const REFRESH_TTL = config.jwt.refreshTtl

// ─── Access token ─────────────────────────────────────────────────────────────
function signAccessToken(user) {
	return jwt.sign(
		{
			sub:   String(user._id),
			nome:  user.nome,
			email: user.email,
			role:  user.role || 'consumidor',
		},
		ACCESS_SECRET,
		{ expiresIn: ACCESS_TTL }
	)
}

function verifyAccessToken(token) {
	return jwt.verify(token, ACCESS_SECRET)
}

// Extrai o Bearer token do header Authorization ou do cookie de acesso
function extractAccessToken(req) {
	const header = req.headers['authorization'] || ''
	if (header.startsWith('Bearer ')) return header.slice(7)
	// Suporte a cookie (modo browser)
	if (req.cookies && req.cookies[config.cookies.name]) {
		return req.cookies[config.cookies.name]
	}
	return null
}

// ─── Refresh token ────────────────────────────────────────────────────────────
function signRefreshToken(user) {
	return jwt.sign(
		{ sub: String(user._id) },
		REFRESH_SECRET,
		{ expiresIn: REFRESH_TTL }
	)
}

function verifyRefreshToken(token) {
	return jwt.verify(token, REFRESH_SECRET)
}

// Nome do cookie onde o refresh token é guardado
const REFRESH_COOKIE = config.cookies.refreshName

// ─── Cookie helpers ───────────────────────────────────────────────────────────
function buildAuthCookieOptions() {
	return {
		httpOnly: true,
		secure: config.cookies.secure,
		sameSite: config.cookies.sameSite,
		domain:   config.cookies?.domain || undefined,
		path:     config.cookies?.path   || '/',
		maxAge: config.cookies.accessMaxAgeMs,
	}
}

function buildRefreshCookieOptions() {
	return {
		httpOnly: true,
		secure: config.cookies.secure,
		sameSite: config.cookies.sameSite,
		domain:   config.cookies?.domain || undefined,
		path: config.cookies.refreshPath,
		maxAge: config.cookies.refreshMaxAgeMs,
	}
}

module.exports = {
	signAccessToken,
	verifyAccessToken,
	extractAccessToken,
	signRefreshToken,
	verifyRefreshToken,
	buildAuthCookieOptions,
	buildRefreshCookieOptions,
	REFRESH_COOKIE,
}