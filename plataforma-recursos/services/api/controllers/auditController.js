const AuditLog = require('../models/AuditLog')
const { getPagination, totalPages, jsonError } = require('../lib/http')
const { recordAuditEvent, sanitizeMetadata } = require('../audit')

function buildFilters(query = {}) {
	const filters = {}
	if (query.action) filters.action = String(query.action).trim()
	if (query.status) filters.status = String(query.status).trim()
	if (query.service) filters.service = String(query.service).trim()
	if (query.actorId) filters['actor.id'] = String(query.actorId).trim()
	if (query.targetType) filters['target.type'] = String(query.targetType).trim()
	if (query.targetId) filters['target.id'] = String(query.targetId).trim()

	const createdAt = {}
	if (query.from) {
		const from = Date.parse(query.from)
		if (!Number.isNaN(from)) createdAt.$gte = new Date(from)
	}
	if (query.to) {
		const to = Date.parse(query.to)
		if (!Number.isNaN(to)) {
			const end = new Date(to)
			end.setHours(23, 59, 59, 999)
			createdAt.$lte = end
		}
	}
	if (Object.keys(createdAt).length) filters.createdAt = createdAt

	return filters
}

module.exports.list = async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query, { defaultLimit: 30, maxLimit: 100 })
		const filters = buildFilters(req.query)
		const [items, total, actions, services] = await Promise.all([
			AuditLog.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
			AuditLog.countDocuments(filters),
			AuditLog.distinct('action'),
			AuditLog.distinct('service'),
		])

		res.json({
			ok: true,
			page,
			limit,
			total,
			totalPages: totalPages(total, limit),
			items,
			filters,
			options: {
				actions: actions.sort(),
				services: services.sort(),
			},
		})
	} catch (err) {
		console.error('[audit] list error:', err)
		jsonError(res, 500, { code: 'AUDIT_LIST_FAILED', message: 'erro interno ao listar auditoria' })
	}
}

module.exports.createInternal = async (req, res) => {
	try {
		const payload = req.body || {}
		if (!payload.action) {
			return jsonError(res, 400, {
				code: 'AUDIT_ACTION_REQUIRED',
				message: 'campo action é obrigatório',
			})
		}

		await recordAuditEvent({
			service: payload.service || 'internal',
			action: payload.action,
			method: payload.method || 'SYSTEM',
			path: payload.path || '',
			status: payload.status,
			statusCode: payload.statusCode,
			requestId: payload.requestId || req.requestId,
			ip: payload.ip || req.ip,
			userAgent: payload.userAgent || req.headers['user-agent'],
			actor: payload.actor,
			target: payload.target,
			metadata: sanitizeMetadata(payload.metadata),
		})
		res.status(201).json({ ok: true })
	} catch (err) {
		console.error('[audit] create internal error:', err)
		jsonError(res, 500, { code: 'AUDIT_CREATE_FAILED', message: 'erro interno ao registar auditoria' })
	}
}
