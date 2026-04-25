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

const config = {
	port: parsePort(process.env.PORT, 16020, 'PORT'),
	services: {
		apiUrl: parseUrl(process.env.API_URL || 'http://api:16025', 'API_URL'),
		authUrl: parseUrl(process.env.AUTH_URL || 'http://auth:16027', 'AUTH_URL'),
		interfaceUrl: parseUrl(process.env.INTERFACE_URL || 'http://interface:16026', 'INTERFACE_URL'),
	},
}

module.exports = { config }
