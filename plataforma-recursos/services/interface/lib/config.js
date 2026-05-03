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

const config = {
	port: parsePort(process.env.PORT, 16026, 'PORT'),
	nodeEnv,
	session: {
		secret: getSessionSecret(nodeEnv),
		cookieName: process.env.SESSION_COOKIE_NAME || 'ew.sid',
	},
	services: {
		authUrl: parseUrl(process.env.AUTH_URL || 'http://auth:16027', 'AUTH_URL'),
		apiUrl: parseUrl(process.env.API_URL || 'http://api:16025', 'API_URL'),
	},
	auth: {
		refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME || 'ew2026_refresh',
	},
	internal: {
		serviceToken: requiredEnv('INTERNAL_SERVICE_TOKEN'),
	},
	dataTransfer: {
		maxImportFileSizeBytes: 256 * 1024 * 1024,
	},
}

module.exports = { config }
