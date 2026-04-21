const { jsonError } = require('../lib/http')
const { extractAccessToken, verifyAccessToken } = require('../lib/jwt')

function requireAuth(req, res, next) {
	try {
		const token = extractAccessToken(req)
		if (!token) {
			return jsonError(res, 401, { code: 'TOKEN_MISSING', message: 'token ausente' })
		}

		const payload = verifyAccessToken(token)
		req.user = payload
		next()
	} catch (err) {
		return jsonError(res, 401, { code: 'INVALID_TOKEN', message: 'token inválido ou expirado' })
	}
}

function requireAdmin(req, res, next) {
	if (!req.user || req.user.nivel !== 'admin') {
		return jsonError(res, 403, { code: 'FORBIDDEN', message: 'acesso reservado a admin' })
	}
	next()
}

module.exports = {
	requireAuth,
	requireAdmin,
}
