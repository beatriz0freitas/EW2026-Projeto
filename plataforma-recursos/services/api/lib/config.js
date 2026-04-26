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
	storage: {
		aipDir: process.env.AIP_DIR || '/aip',
	},
}

module.exports = { config }
