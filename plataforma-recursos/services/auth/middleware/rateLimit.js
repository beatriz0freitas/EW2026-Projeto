const { config } = require('../lib/config')
const { jsonError } = require('../lib/http')

const buckets = new Map()

function getIdentifierFromBody(req) {
	const email = String(req.body?.email || '').trim().toLowerCase()
	if (email) return email
	const username = String(req.body?.username || '').trim().toLowerCase()
	if (username) return username
	return 'anonymous'
}

function buildKey(req) {
	const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown')
	const identifier = getIdentifierFromBody(req)
	return `${ip}::${identifier}`
}

function cleanupExpiredEntries(now, windowMs) {
	for (const [key, entry] of buckets.entries()) {
		if (entry.expiresAt <= now) {
			buckets.delete(key)
		}
	}
}

function rateLimitLogin(req, res, next) {
	const windowMs = config.security.loginRateLimitWindowMs
	const maxAttempts = config.security.loginRateLimitMaxAttempts
	const now = Date.now()

	if (buckets.size > 2000) {
		cleanupExpiredEntries(now, windowMs)
	}

	const key = buildKey(req)
	const entry = buckets.get(key)

	if (!entry || entry.expiresAt <= now) {
		buckets.set(key, { count: 1, expiresAt: now + windowMs })
		return next()
	}

	if (entry.count >= maxAttempts) {
		const retryAfterSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))
		res.setHeader('Retry-After', String(retryAfterSec))
		return jsonError(res, 429, {
			code: 'TOO_MANY_REQUESTS',
			message: 'demasiadas tentativas de login; tenta novamente mais tarde',
			details: { retryAfterSec },
		})
	}

	entry.count += 1
	buckets.set(key, entry)
	return next()
}

module.exports = {
	rateLimitLogin,
}
