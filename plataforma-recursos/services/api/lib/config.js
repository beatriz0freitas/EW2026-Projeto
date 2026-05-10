function parsePort(value, fallback, name) {
	const port = Number(value ?? fallback)
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`${name} inválida: ${value}`)
	}
	return port
}

function parseUrl(value, name) {
	try {
		return new URL(value).toString().replace(/\/$/, '')
	} catch {
		throw new Error(`${name} inválida: ${value}`)
	}
}

function parsePositiveInt(value, fallback, name) {
	const parsed = Number(value ?? fallback)
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} inválida: ${value}`)
	}
	return parsed
}

function parseUrlList(value, fallback, name) {
	const raw = String(value ?? fallback)
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)

	if (!raw.length) {
		throw new Error(`${name} em falta ou vazio.`)
	}

	return raw.map((origin) => {
		if (origin === '*') return origin
		return parseUrl(origin, name)
	})
}

function requiredEnv(name) {
	const value = process.env[name]
	if (!value) {
		throw new Error(`${name} em falta. Define ${name} no ambiente para arrancar o serviço API.`)
	}
	return value
}

const config = {
	port: parsePort(process.env.PORT, 16025, 'PORT'),
	mongoUrl: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ew2026',
	auth: {
		url: parseUrl(process.env.AUTH_URL || 'http://auth:16027', 'AUTH_URL'),
		cookieName: process.env.AUTH_COOKIE_NAME || 'ew.auth',
	},
	internal: {
		serviceToken: requiredEnv('INTERNAL_SERVICE_TOKEN'),
	},
	cors: {
		origins: parseUrlList(process.env.API_CORS_ORIGINS || process.env.CORS_ORIGIN, 'http://localhost:16020', 'API_CORS_ORIGINS'),
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
	},
	security: {
		rateLimitWindowMs: parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'API_RATE_LIMIT_WINDOW_MS'),
		rateLimitMaxRequests: parsePositiveInt(process.env.API_RATE_LIMIT_MAX_REQUESTS, 300, 'API_RATE_LIMIT_MAX_REQUESTS'),
	},
	storage: {
		aipDir: process.env.AIP_DIR || '/aip',
	},
	oais: {
		maxSipFileSizeBytes: parsePositiveInt(process.env.SIP_MAX_FILE_SIZE_BYTES, 100 * 1024 * 1024, 'SIP_MAX_FILE_SIZE_BYTES'),
	},
	dataTransfer: {
		maxImportFileSizeBytes: parsePositiveInt(process.env.MAX_IMPORT_FILE_SIZE_BYTES, 256 * 1024 * 1024, 'MAX_IMPORT_FILE_SIZE_BYTES'),
		jsonBodyLimit: '20mb',
	},
}

module.exports = { config }
