const express = require('express')
const mongoose = require('mongoose')
const { randomUUID } = require('crypto')
 
const routes = require('./routes')
 
const PORT = Number(process.env.PORT || 16027)
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ew2026'
 
const app = express()
app.use(express.json())

app.use((req, res, next) => {
	const requestId = req.headers['x-request-id'] || randomUUID()
	req.requestId = requestId
	res.locals.requestId = requestId
	res.setHeader('X-Request-Id', requestId)
	next()
})
 
app.use((req, res, next) => {
	const d = new Date().toISOString().substring(0, 16)
	console.log(`[auth] ${req.method} ${req.url} ${d} [${req.requestId}]`)
	next()
})
 
mongoose
	.connect(MONGO_URL)
	.then(() => console.log('Conectado com sucesso ao MongoDB'))
	.catch((err) => console.error('Erro ao conectar ao MongoDB:', err))
 
app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})
 
app.use('/', routes)
 
app.listen(PORT, () => {
	console.log(`A ouvir na porta:${PORT}`)
})
 