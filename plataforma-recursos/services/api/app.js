const express = require('express')
const mongoose = require('mongoose')
const { randomUUID } = require('crypto')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')

const routes = require('./routes')
const swaggerDocument = YAML.load('./swagger.yaml')

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
	console.log(`[api] ${req.method} ${req.url} ${d} [${req.requestId}]`)
	next()
})

const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ew2026'
mongoose
	.connect(mongoUrl)
	.then(() => console.log('MongoDB: connected'))
	.catch((err) => console.error('MongoDB: connection error:', err))

app.use('/api', routes)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

const port = Number(process.env.PORT || 16025)
app.listen(port, () => {
	console.log(`API listening on port ${port}`)
})

