const AuditLog = require('../models/AuditLog')
const { sanitizeMetadata } = require('./sanitize')

function buildActor(user, fallback = {}) {
	return {
		id: user?.sub || user?._id || user?.id || fallback.id || null,
		role: user?.role || fallback.role || null,
		nome: user?.nome || fallback.nome || null,
	}
}

async function recordAuditEvent(event) {
	try {
		await AuditLog.create({
			service: event.service || 'api',
			action: event.action || 'unknown',
			method: event.method || 'SYSTEM',
			path: event.path || '',
			status: event.status || 'success',
			statusCode: Number(event.statusCode || 200),
			requestId: event.requestId || null,
			ip: event.ip || null,
			userAgent: event.userAgent || null,
			actor: buildActor(event.actor || null),
			target: event.target || { type: null, id: null },
			metadata: sanitizeMetadata(event.metadata),
			createdAt: event.createdAt || new Date(),
		})
	} catch (err) {
		console.error('[audit] warning: could not record audit event:', err)
	}
}

module.exports = { recordAuditEvent }
