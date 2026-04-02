const express = require('express')
const routes = require('./routes')

const PORT = Number(process.env.PORT || 16020)
const API_URL = process.env.API_URL || 'http://api:16025'
const AUTH_URL = process.env.AUTH_URL || 'http://auth:16027'
const INTERFACE_URL = process.env.INTERFACE_URL || 'http://interface:16026'

const app = express()

app.use((req, res, next) => {
	const d = new Date().toISOString().substring(0, 16)
	console.log(`[gateway] ${req.method} ${req.url} ${d}`)
	next()
})

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.use('/', routes)

app.listen(PORT, () => {
	console.log(`[gateway] listening on :${PORT}`)
	console.log(`[gateway] API_URL=${API_URL}`)
	console.log(`[gateway] AUTH_URL=${AUTH_URL}`)
	console.log(`[gateway] INTERFACE_URL=${INTERFACE_URL}`)
})

