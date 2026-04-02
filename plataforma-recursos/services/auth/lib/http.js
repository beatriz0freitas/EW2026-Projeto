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

module.exports = {
	jsonError,
}
