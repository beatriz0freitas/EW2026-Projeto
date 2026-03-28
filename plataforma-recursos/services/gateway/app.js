const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')

const PORT = Number(process.env.PORT || 16020)
const API_URL = process.env.API_URL || 'http://api:16025'
const AUTH_URL = process.env.AUTH_URL || 'http://auth:16027'
const INTERFACE_URL = process.env.INTERFACE_URL || 'http://interface:16026'

const app = express()

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.use(
	'/api',
	createProxyMiddleware({
		target: API_URL,
		changeOrigin: true,
		pathRewrite: (path) => `/api${path}`,
		xfwd: true,
		proxyTimeout: 60_000,
		onError: (err, req, res) => {
			res.status(502).json({ ok: false, error: 'bad_gateway', message: err.message })
		},
	})
)

app.use(
	'/auth',
	createProxyMiddleware({
		target: AUTH_URL,
		changeOrigin: true,
		xfwd: true,
		proxyTimeout: 60_000,
		onError: (err, req, res) => {
			res.status(502).json({ ok: false, error: 'bad_gateway', message: err.message })
		},
	})
)

app.use(
	'/',
	createProxyMiddleware({
		target: INTERFACE_URL,
		changeOrigin: true,
		xfwd: true,
		proxyTimeout: 60_000,
	})
)

app.listen(PORT, () => {
	console.log(`[gateway] listening on :${PORT}`)
	console.log(`[gateway] API_URL=${API_URL}`)
	console.log(`[gateway] AUTH_URL=${AUTH_URL}`)
	console.log(`[gateway] INTERFACE_URL=${INTERFACE_URL}`)
})

