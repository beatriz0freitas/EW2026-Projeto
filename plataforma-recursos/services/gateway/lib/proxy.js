const { createProxyMiddleware } = require('http-proxy-middleware')

function badGatewayHandler(err, req, res) {
	res.status(502).json({
		ok: false,
		error: 'bad_gateway',
		message: err.message,
	})
}

function serviceProxy(target, options = {}) {
	return createProxyMiddleware({
		target,
		changeOrigin: true,
		xfwd: true,
		proxyTimeout: 60_000,
		onError: badGatewayHandler,
		...options,
	})
}

module.exports = {
	serviceProxy,
}
