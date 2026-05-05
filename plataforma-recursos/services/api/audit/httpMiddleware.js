const { recordAuditEvent } = require('./recorder')

function getClientIp(req) {
	const forwarded = req.headers['x-forwarded-for']
	if (forwarded) return String(forwarded).split(',')[0].trim()
	return req.ip || req.socket?.remoteAddress || null
}

function inferTarget(path) {
	const cleanPath = String(path || '').split('?')[0]
	const patterns = [
		[/\/api\/resources\/([^/]+)/, 'resource'],
		[/\/api\/oais\/access\/([^/]+)/, 'resource'],
		[/\/api\/posts\/([^/]+)\/comments\/([^/]+)/, 'comment'],
		[/\/api\/posts\/([^/]+)/, 'post'],
		[/\/api\/news\/([^/]+)/, 'news'],
	]

	for (const [pattern, type] of patterns) {
		const match = cleanPath.match(pattern)
		if (match) return { type, id: match[match.length - 1] }
	}

	if (cleanPath.includes('/export') || cleanPath.includes('/import')) {
		return { type: 'data_dump', id: null }
	}

	return { type: null, id: null }
}

function inferAction(req) {
	const method = req.method
	const path = String(req.originalUrl || req.url || '').split('?')[0]

	if (path.includes('/oais/ingest')) return 'resource.create'
	if (path.includes('/oais/access/')) return 'resource.download'
	if (path.includes('/export')) return 'data.export'
	if (path.includes('/import')) return 'data.import'
	if (path.includes('/ratings')) return method === 'GET' ? 'rating.read' : 'rating.upsert'
	if (path.includes('/comments')) {
		if (method === 'POST') return 'comment.create'
		if (method === 'DELETE') return 'comment.delete'
		return 'comment.read'
	}
	if (path.includes('/posts')) {
		if (method === 'POST') return 'post.create'
		if (method === 'PATCH') return 'post.update'
		if (method === 'DELETE') return 'post.delete'
		return 'post.read'
	}
	if (path.includes('/resources')) {
		if (method === 'PATCH') return 'resource.update'
		if (method === 'DELETE') return 'resource.delete'
		return 'resource.read'
	}
	if (path.includes('/news')) {
		if (method === 'POST') return 'news.create'
		if (method === 'DELETE') return 'news.delete'
		return 'news.read'
	}
	if (path.includes('/audit')) return 'audit.read'

	return `http.${method.toLowerCase()}`
}

function shouldAuditRequest(req) {
	const path = String(req.originalUrl || req.url || '').split('?')[0]
	if (path.includes('/health') || path.includes('/openapi.json') || path.includes('/docs')) return false
	if (path.includes('/internal/audit')) return false
	return path.startsWith('/api/')
}

function auditHttpRequests(req, res, next) {
	if (!shouldAuditRequest(req)) return next()

	const startedAt = Date.now()
	res.on('finish', () => {
		const statusCode = res.statusCode
		recordAuditEvent({
			service: 'api',
			action: inferAction(req),
			method: req.method,
			path: req.originalUrl || req.url,
			status: statusCode < 400 ? 'success' : 'failure',
			statusCode,
			requestId: req.requestId || res.locals?.requestId,
			ip: getClientIp(req),
			userAgent: req.headers['user-agent'] || null,
			actor: req.user || null,
			target: inferTarget(req.originalUrl || req.url),
			metadata: {
				query: req.query,
				durationMs: Date.now() - startedAt,
			},
		})
	})

	next()
}

module.exports = { auditHttpRequests }
