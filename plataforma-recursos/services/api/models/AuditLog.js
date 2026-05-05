const mongoose = require('mongoose')

const AuditLogSchema = new mongoose.Schema(
	{
		service: { type: String, required: true, trim: true, index: true },
		action: { type: String, required: true, trim: true, index: true },
		method: { type: String, required: true, trim: true },
		path: { type: String, required: true, trim: true, index: true },
		status: { type: String, enum: ['success', 'failure'], required: true, index: true },
		statusCode: { type: Number, required: true, index: true },
		requestId: { type: String, default: null, index: true },
		ip: { type: String, default: null },
		userAgent: { type: String, default: null },
		actor: {
			id: { type: String, default: null, index: true },
			role: { type: String, default: null },
			nome: { type: String, default: null },
		},
		target: {
			type: { type: String, default: null, index: true },
			id: { type: String, default: null, index: true },
		},
		metadata: { type: Object, default: {} },
		createdAt: { type: Date, default: () => new Date(), index: true },
	},
	{ versionKey: false }
)

AuditLogSchema.index({ createdAt: -1 })
AuditLogSchema.index({ 'actor.id': 1, createdAt: -1 })
AuditLogSchema.index({ action: 1, createdAt: -1 })
AuditLogSchema.index({ 'target.type': 1, 'target.id': 1, createdAt: -1 })

module.exports = mongoose.model('AuditLog', AuditLogSchema, 'audit_logs')
