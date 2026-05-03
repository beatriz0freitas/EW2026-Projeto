const { config } = require('../lib/config')
const { jsonError } = require('../lib/http')

const buckets = new Map()

function clientIp(req) {
	const forwardedFor = String(req.headers['x-forwarded-for'] || '')
		.split(',')[0]
		.trim()

	return forwardedFor || String(req.ip || req.socket?.remoteAddress || 'unknown')
}

function cleanupExpiredEntries(now) {
	for (const [key, entry] of buckets.entries()) {
		if (entry.expiresAt <= now) {
			buckets.delete(key)
		}
	}
}

function setRateLimitHeaders(res, entry, now) {
	const limit = config.security.rateLimitMaxRequests
	const remaining = Math.max(0, limit - entry.count)
	const resetSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))

	res.setHeader('RateLimit-Limit', String(limit))
	res.setHeader('RateLimit-Remaining', String(remaining))
	res.setHeader('RateLimit-Reset', String(resetSec))
}

function rateLimitApi(req, res, next) {
	if (req.method === 'OPTIONS' || req.path === '/api/health') {
		return next()
	}

	const now = Date.now()
	const windowMs = config.security.rateLimitWindowMs
	const maxRequests = config.security.rateLimitMaxRequests

	if (buckets.size > 5000) {
		cleanupExpiredEntries(now)
	}

	const key = clientIp(req)
	const entry = buckets.get(key)

	if (!entry || entry.expiresAt <= now) {
		const freshEntry = { count: 1, expiresAt: now + windowMs }
		buckets.set(key, freshEntry)
		setRateLimitHeaders(res, freshEntry, now)
		return next()
	}

	if (entry.count >= maxRequests) {
		setRateLimitHeaders(res, entry, now)
		const retryAfterSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))
		res.setHeader('Retry-After', String(retryAfterSec))
		return jsonError(res, 429, {
			code: 'TOO_MANY_REQUESTS',
			message: 'demasiados pedidos; tenta novamente mais tarde',
			details: { retryAfterSec },
		})
	}

	entry.count += 1
	buckets.set(key, entry)
	setRateLimitHeaders(res, entry, now)
	return next()
}

module.exports = {
	rateLimitApi,
}
