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

function parseHour(value, fallback, name) {
	const resolved = value ?? fallback
	const parsed = Number(resolved)
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
		throw new Error(`${name} inválida: ${value}`)
	}
	return parsed
}

function parseMinute(value, fallback, name) {
	const resolved = value ?? fallback
	const parsed = Number(resolved)
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 59) {
		throw new Error(`${name} inválida: ${value}`)
	}
	return parsed
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
	newsJobs: {
		dailyHour: parseHour(process.env.NEWS_JOB_DAILY_HOUR, 0, 'NEWS_JOB_DAILY_HOUR'),
		dailyMinute: parseMinute(process.env.NEWS_JOB_DAILY_MINUTE, 5, 'NEWS_JOB_DAILY_MINUTE'),
	},
	storage: {
		aipDir: process.env.AIP_DIR || '/aip',
	},
}

module.exports = { config }
