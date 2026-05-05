const { config } = require('./config')

function getClientIp(req) {
	const forwarded = req.headers['x-forwarded-for']
	if (forwarded) return String(forwarded).split(',')[0].trim()
	return req.ip || req.socket?.remoteAddress || null
}

function actorFromUser(user) {
	if (!user) return null
	return {
		id: user.sub || user._id || user.id || null,
		role: user.role || null,
		nome: user.nome || null,
	}
}

async function recordAuditEvent(req, event) {
	const payload = {
		service: 'auth',
		method: req.method,
		path: req.originalUrl || req.url,
		status: event.status || 'success',
		statusCode: event.statusCode || 200,
		requestId: req.requestId || null,
		ip: getClientIp(req),
		userAgent: req.headers['user-agent'] || null,
		actor: event.actor || actorFromUser(req.user),
		action: event.action,
		target: event.target,
		metadata: event.metadata,
	}

	try {
		const response = await fetch(`${config.services.apiUrl}/api/internal/audit`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'X-Internal-Token': config.internal.serviceToken,
			},
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			console.error('[auth] warning: API rejected audit event with status', response.status)
		}
	} catch (err) {
		console.error('[auth] warning: could not publish audit event to API:', err)
	}
}

function recordAuditEventAsync(req, event) {
	recordAuditEvent(req, event).catch((err) => {
		console.error('[auth] warning: audit event failed:', err)
	})
}

module.exports = {
	recordAuditEventAsync,
}
