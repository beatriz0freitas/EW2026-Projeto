const { isValidObjectId } = require('mongoose')

function getPagination(query, { defaultLimit = 10, maxLimit = 50 } = {}) {
	const page = Math.max(1, Number(query.page) || 1)
	const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit))
	const skip = (page - 1) * limit

	return { page, limit, skip }
}

function totalPages(total, limit) {
	return Math.ceil(total / limit) || 1
}

function jsonError(res, status, errorOrOptions) {
	const options =
		typeof errorOrOptions === 'string'
			? { message: errorOrOptions }
			: errorOrOptions || {}

	const message = options.message || 'erro interno'
	const payload = {
		ok: false,
		code: options.code || `HTTP_${status}`,
		message,
		details: options.details || null,
		requestId: res.locals?.requestId || null,
		// Compatibilidade com clientes antigos
		error: message,
	}

	return res.status(status).json(payload)
}

function invalidId(res) {
	return jsonError(res, 400, { code: 'INVALID_ID', message: 'id inválido' })
}

function isMongoId(value) {
	return isValidObjectId(value)
}

module.exports = {
	getPagination,
	totalPages,
	jsonError,
	invalidId,
	isMongoId,
}
