const User = require('../models/User')
const { jsonError } = require('../lib/http')
const { extractAccessToken, verifyAccessToken } = require('../lib/jwt')

function tokenFromQuery(req) {
	if (req.query && req.query.token) return String(req.query.token)
	return null
}

async function verificaAcesso(req, res, next) {
	try {
		const token = extractAccessToken(req) || tokenFromQuery(req)
		if (!token) {
			return jsonError(res, 401, { code: 'TOKEN_MISSING', message: 'token ausente' })
		}

		const payload = verifyAccessToken(token)
		const user = await User.findById(payload.sub)

		if (!user || !user.ativo) {
			return jsonError(res, 401, {
				code: 'ACCOUNT_DISABLED',
				message: 'conta inexistente ou desativada',
			})
		}

		const role = user.role || 'consumidor'

		req.user = {
			...payload,
			sub: String(user._id),
			username: String(user._id),
			role,
			nivel_acesso: user.nivel_acesso,
			ativo: user.ativo,
		}

		next()
	} catch {
		return jsonError(res, 401, { code: 'INVALID_TOKEN', message: 'token invalido ou expirado' })
	}
}

function requireAdmin(req, res, next) {
	if (!req.user || req.user.role !== 'admin') {
		return jsonError(res, 403, { code: 'FORBIDDEN', message: 'acesso reservado a admin' })
	}
	next()
}

module.exports = {
	verificaAcesso,
	requireAdmin,
}
