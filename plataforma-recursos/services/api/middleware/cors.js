const { config } = require('../lib/config')
const { jsonError } = require('../lib/http')

function isOriginAllowed(origin) {
	if (!origin) return true
	if (config.cors.origins.includes('*')) return true
	return config.cors.origins.includes(origin)
}

function applyCorsHeaders(req, res) {
	const origin = req.headers.origin

	if (origin && isOriginAllowed(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin)
		res.setHeader('Vary', 'Origin')
	}

	if (config.cors.credentials) {
		res.setHeader('Access-Control-Allow-Credentials', 'true')
	}

	res.setHeader('Access-Control-Allow-Methods', config.cors.methods.join(', '))
	res.setHeader('Access-Control-Allow-Headers', config.cors.allowedHeaders.join(', '))
}

function explicitCors(req, res, next) {
	const origin = req.headers.origin

	if (origin && !isOriginAllowed(origin)) {
		return jsonError(res, 403, {
			code: 'CORS_ORIGIN_DENIED',
			message: 'origem CORS não autorizada',
		})
	}

	applyCorsHeaders(req, res)

	if (req.method === 'OPTIONS') {
		return res.status(204).end()
	}

	return next()
}

module.exports = {
	explicitCors,
}
