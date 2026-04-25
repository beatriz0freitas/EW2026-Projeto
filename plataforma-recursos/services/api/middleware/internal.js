const crypto = require('crypto')

const { config } = require('../lib/config')
const { jsonError } = require('../lib/http')

function extractInternalToken(req) {
	const headerToken = req.headers['x-internal-token']
	if (headerToken) return String(headerToken)

	const authHeader = req.headers['authorization'] || ''
	if (authHeader.startsWith('Bearer ')) return authHeader.slice(7)

	return null
}

function safeEqual(a, b) {
	const left = Buffer.from(String(a || ''), 'utf8')
	const right = Buffer.from(String(b || ''), 'utf8')
	if (left.length !== right.length) return false
	return crypto.timingSafeEqual(left, right)
}

function requireInternalService(req, res, next) {
	const token = extractInternalToken(req)
	if (!token) {
		return jsonError(res, 401, { code: 'INTERNAL_TOKEN_MISSING', message: 'token interno ausente' })
	}

	if (!safeEqual(token, config.internal.serviceToken)) {
		return jsonError(res, 403, { code: 'INTERNAL_TOKEN_INVALID', message: 'token interno invalido' })
	}

	next()
}

module.exports = {
	requireInternalService,
}
