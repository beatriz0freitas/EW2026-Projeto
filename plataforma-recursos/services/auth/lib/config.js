function requiredEnv(name) {
	const value = process.env[name]
	if (!value) {
		throw new Error(`${name} em falta. Define ${name} no ambiente para arrancar o serviço auth.`)
	}
	return value
}

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

function nonEmptyString(value, fallback, name) {
	const resolved = (value ?? fallback ?? '').toString().trim()
	if (!resolved) {
		throw new Error(`${name} em falta ou vazio.`)
	}
	return resolved
}

const config = {
	port: parsePort(process.env.PORT, 16027, 'PORT'),
	nodeEnv: process.env.NODE_ENV || 'development',
	mongoUrl: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ew2026',

	jwt: {
		secret: requiredEnv('JWT_SECRET'),
		accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev-access-secret',
		refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
		accessTtl: nonEmptyString(process.env.JWT_ACCESS_TTL, '15m', 'JWT_ACCESS_TTL'),
		refreshTtl: nonEmptyString(process.env.JWT_REFRESH_TTL, '7d', 'JWT_REFRESH_TTL'),
	},

	cookies: {
		name: process.env.AUTH_COOKIE_NAME || 'ew.auth',
		refreshName: process.env.AUTH_REFRESH_COOKIE_NAME || 'ew2026_refresh',
		sameSite: process.env.AUTH_COOKIE_SAMESITE || 'lax',
		domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		accessMaxAgeMs: parsePositiveInt(process.env.AUTH_COOKIE_ACCESS_MAX_AGE_MS, 15 * 60 * 1000, 'AUTH_COOKIE_ACCESS_MAX_AGE_MS'),
		refreshMaxAgeMs: parsePositiveInt(process.env.AUTH_COOKIE_REFRESH_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000, 'AUTH_COOKIE_REFRESH_MAX_AGE_MS'),
		refreshPath: process.env.AUTH_REFRESH_COOKIE_PATH || '/sessions/refresh',
	},

	cors: {
		origin: parseUrl(process.env.AUTH_CORS_ORIGIN || 'http://localhost:16020', 'AUTH_CORS_ORIGIN'),
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
	},

	services: {
		apiUrl: parseUrl(process.env.API_URL || 'http://api:16025', 'API_URL'),
	},

	internal: {
		serviceToken: requiredEnv('INTERNAL_SERVICE_TOKEN'),
	},

	security: {
		loginRateLimitWindowMs: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000, 'AUTH_LOGIN_RATE_LIMIT_WINDOW_MS'),
		loginRateLimitMaxAttempts: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 10, 'AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS'),
	},
}

module.exports = {
	config,
}
