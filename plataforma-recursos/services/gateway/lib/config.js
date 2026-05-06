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

function lerInteiroPositivo(value, fallback, name) {
	const numero = Number(value ?? fallback)
	if (!Number.isInteger(numero) || numero <= 0) {
		throw new Error(`${name} inválida: ${value}`)
	}
	return numero
}

const config = {
	port: parsePort(process.env.PORT, 16020, 'PORT'),
	services: {
		apiUrl: parseUrl(process.env.API_URL || 'http://api:16025', 'API_URL'),
		authUrl: parseUrl(process.env.AUTH_URL || 'http://auth:16027', 'AUTH_URL'),
		interfaceUrl: parseUrl(process.env.INTERFACE_URL || 'http://interface:16026', 'INTERFACE_URL'),
	},
	seguranca: {
		janelaLimitePedidosMs: lerInteiroPositivo(process.env.GATEWAY_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'GATEWAY_RATE_LIMIT_WINDOW_MS'),
		maximoPedidosLimite: lerInteiroPositivo(process.env.GATEWAY_RATE_LIMIT_MAX_REQUESTS, 500, 'GATEWAY_RATE_LIMIT_MAX_REQUESTS'),
	},
}

module.exports = { config }
