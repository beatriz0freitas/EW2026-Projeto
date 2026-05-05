const { auditHttpRequests } = require('./httpMiddleware')
const { recordAuditEvent } = require('./recorder')
const { sanitizeMetadata } = require('./sanitize')

module.exports = {
	auditHttpRequests,
	recordAuditEvent,
	sanitizeMetadata,
}
