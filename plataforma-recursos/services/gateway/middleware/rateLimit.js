const { config } = require('../lib/config')

const baldes = new Map()

function obterIpCliente(req) {
	const encaminhadoPor = String(req.headers['x-forwarded-for'] || '')
		.split(',')[0]
		.trim()

	return encaminhadoPor || String(req.ip || req.socket?.remoteAddress || 'desconhecido')
}

function limparEntradasExpiradas(agora) {
	for (const [chave, entrada] of baldes.entries()) {
		if (entrada.expiraEm <= agora) {
			baldes.delete(chave)
		}
	}
}

function definirCabecalhosLimite(res, entrada, agora) {
	const limite = config.seguranca.maximoPedidosLimite
	const restantes = Math.max(0, limite - entrada.contagem)
	const reinicioSeg = Math.max(1, Math.ceil((entrada.expiraEm - agora) / 1000))

	res.setHeader('RateLimit-Limit', String(limite))
	res.setHeader('RateLimit-Remaining', String(restantes))
	res.setHeader('RateLimit-Reset', String(reinicioSeg))
}

function responderErroLimitePedidos(res, tentativasNovasAposSeg) {
	res.status(429).json({
		ok: false,
		code: 'TOO_MANY_REQUESTS',
		message: 'demasiados pedidos; tenta novamente mais tarde',
		details: { retryAfterSec: tentativasNovasAposSeg },
	})
}

function limitarPedidosGateway(req, res, next) {
	if (req.method === 'OPTIONS' || req.path === '/health') {
		return next()
	}

	const agora = Date.now()
	const janelaMs = config.seguranca.janelaLimitePedidosMs
	const maximoPedidos = config.seguranca.maximoPedidosLimite

	if (baldes.size > 5000) {
		limparEntradasExpiradas(agora)
	}

	const chave = obterIpCliente(req)
	const entrada = baldes.get(chave)

	if (!entrada || entrada.expiraEm <= agora) {
		const entradaNova = { contagem: 1, expiraEm: agora + janelaMs }
		baldes.set(chave, entradaNova)
		definirCabecalhosLimite(res, entradaNova, agora)
		return next()
	}

	if (entrada.contagem >= maximoPedidos) {
		definirCabecalhosLimite(res, entrada, agora)
		const tentarNovamenteAposSeg = Math.max(1, Math.ceil((entrada.expiraEm - agora) / 1000))
		res.setHeader('Retry-After', String(tentarNovamenteAposSeg))
		return responderErroLimitePedidos(res, tentarNovamenteAposSeg)
	}

	entrada.contagem += 1
	baldes.set(chave, entrada)
	definirCabecalhosLimite(res, entrada, agora)
	return next()
}

module.exports = {
	limitarPedidosGateway,
}