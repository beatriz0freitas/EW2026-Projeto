const jwt = require('jsonwebtoken')
const { jsonError } = require('../lib/http')

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
	throw new Error('JWT_SECRET em falta. Define JWT_SECRET no ambiente para arrancar o serviço auth.')
}

function getBearerToken(req) {
	const authHeader = req.headers['authorization'] || ''
	if (!authHeader.startsWith('Bearer ')) return null
	return authHeader.slice(7)
}

function requireAuth(req, res, next) {
	try {
		const token = getBearerToken(req)
		if (!token) {
			return jsonError(res, 401, { code: 'TOKEN_MISSING', message: 'token ausente' })
		}

		const payload = jwt.verify(token, JWT_SECRET)
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
