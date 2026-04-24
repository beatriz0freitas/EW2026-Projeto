const http = require('http')
const { jsonError } = require('../lib/http')
const { config } = require('../lib/config')

const AUTH_URL = config.auth.url
const AUTH_COOKIE_NAME = config.auth.cookieName

// Chama GET /sessions/verify no serviço auth e devolve o payload,
// ou null se o token for inválido/ausente.
function verifyTokenRemote(token) {
	return new Promise((resolve) => {
		const url = new URL('/sessions/verify', AUTH_URL)
		const options = {
			hostname: url.hostname,
			port: url.port || 80,
			path: url.pathname,
			method: 'GET',
			headers: { Authorization: `Bearer ${token}` },
		}
		const req = http.request(options, (res) => {
			let body = ''
			res.on('data', (chunk) => (body += chunk))
			res.on('end', () => {
				try {
					const data = JSON.parse(body)
					resolve(data.ok ? data.payload : null)
				} catch {
					resolve(null)
				}
			})
		})
		req.on('error', () => resolve(null))
		req.end()
	})
}

// Extrai o token por ordem de precedência:
// 1) Header Authorization: Bearer <token>
// 2) Cookie de autenticação
// 3) Query string (?token=...)
function extractToken(req) {
	const header = req.headers['authorization'] || ''
	if (header.startsWith('Bearer ')) return header.slice(7)

	if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
		return req.cookies[AUTH_COOKIE_NAME]
	}

	if (req.query && req.query.token) {
		return String(req.query.token)
	}

	return null
}

// Middleware: exige utilizador autenticado (qualquer role).
// Injeta req.user = payload JWT
async function requireAuth(req, res, next) {
	const token = extractToken(req)
	if (!token) return jsonError(res, 401, { code: 'AUTH_REQUIRED', message: 'autenticação necessária' })

	const payload = await verifyTokenRemote(token)
	if (!payload) return jsonError(res, 401, { code: 'INVALID_TOKEN', message: 'token inválido ou expirado' })

	req.user = payload
	next()
}

// Middleware factory: exige role mínima.
// Hierarquia: admin > produtor > consumidor
// Uso: requireLevel('produtor')  →  aceita produtor e admin
const HIERARCHY = { admin: 3, produtor: 2, consumidor: 1 }

function requireLevel(minLevel) {
	return async (req, res, next) => {
		const token = extractToken(req)
		if (!token) return jsonError(res, 401, { code: 'AUTH_REQUIRED', message: 'autenticação necessária' })

		const payload = await verifyTokenRemote(token)
		if (!payload) return jsonError(res, 401, { code: 'INVALID_TOKEN', message: 'token inválido ou expirado' })

		const userRank = HIERARCHY[payload.role] || 0
		const minRank = HIERARCHY[minLevel] || 0

		if (userRank < minRank) {
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'permissões insuficientes' })
		}

		req.user = payload
		next()
	}
}

// Middleware: opcional — não bloqueia se não houver token,
// mas injeta req.user se houver um token válido.
async function optionalAuth(req, res, next) {
	const token = extractToken(req)
	if (token) {
		const payload = await verifyTokenRemote(token)
		if (payload) req.user = payload
	}
	next()
}

module.exports = { requireAuth, requireLevel, optionalAuth }