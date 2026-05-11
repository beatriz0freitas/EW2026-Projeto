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

function getSessionSecret(nodeEnv) {
	const value = process.env.SESSION_SECRET
	if (nodeEnv === 'production' && !value) {
		throw new Error('SESSION_SECRET em falta em produção.')
	}
	return value || 'dev-session-secret-change-me'
}

function requiredEnv(name) {
	const value = process.env[name]
	if (!value) {
		throw new Error(`${name} em falta. Define ${name} no ambiente para arrancar o serviço interface.`)
	}
	return value
}

const nodeEnv = process.env.NODE_ENV || 'development'
const publicBaseUrl = parseUrl(process.env.PUBLIC_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:16020', 'PUBLIC_BASE_URL')

const config = {
	port: parsePort(process.env.PORT, 16026, 'PORT'),
	nodeEnv,
	publicBaseUrl,
	session: {
		secret: getSessionSecret(nodeEnv),
		cookieName: process.env.SESSION_COOKIE_NAME || 'ew.sid',
		ttlSeconds: parsePositiveInt(process.env.SESSION_TTL_SECONDS, 60 * 60 * 24, 'SESSION_TTL_SECONDS'),
		store: {
			mongoUrl: process.env.SESSION_STORE_MONGO_URL || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ew2026',
			collectionName: process.env.SESSION_STORE_COLLECTION || 'interface_sessions',
		},
	},
	services: {
		authUrl: parseUrl(process.env.AUTH_URL || 'http://auth:16027', 'AUTH_URL'),
		apiUrl: parseUrl(process.env.API_URL || 'http://api:16025', 'API_URL'),
	},
	auth: {
		refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME || 'ew2026_refresh',
	},
	oauth: {
		google: {
			enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			callbackUrl: `${publicBaseUrl}/auth/google/callback`,
		},
		facebook: {
			enabled: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
			appId: process.env.FACEBOOK_APP_ID,
			appSecret: process.env.FACEBOOK_APP_SECRET,
			callbackUrl: `${publicBaseUrl}/auth/facebook/callback`,
		},
	},
	internal: {
		serviceToken: requiredEnv('INTERNAL_SERVICE_TOKEN'),
	},
	dataTransfer: {
		maxImportFileSizeBytes: 256 * 1024 * 1024,
	},
}

module.exports = { config }
