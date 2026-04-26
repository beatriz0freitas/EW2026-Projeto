const express = require('express')
const mongoose = require('mongoose')
const { randomUUID } = require('crypto')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const cookieParser = require('cookie-parser')

const routes = require('./routes')
const { config } = require('./lib/config')
const { jsonError } = require('./lib/http')
const { initSystemNewsTriggers } = require('./lib/systemNewsJob')
const swaggerDocument = YAML.load('./swagger.yaml')

const app = express()

app.use(express.json())
app.use(cookieParser())

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

app.use('/api', routes)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
app.get('/api/openapi.json', (req, res) => {
	res.json(swaggerDocument)
})

app.use((req, res) => {
	jsonError(res, 404, { code: 'NOT_FOUND', message: 'rota não encontrada' })
})

app.use((err, req, res, next) => {
	console.error(`[api] unexpected error [${req.requestId || '-'}]:`, err)
	jsonError(res, err?.status || 500, {
		code: err?.code || 'INTERNAL_ERROR',
		message: err?.message || 'erro interno',
	})
})

async function start() {
	try {
		await mongoose.connect(config.mongoUrl)
		console.log('MongoDB: connected')

		app.listen(config.port, () => {
			console.log(`API listening on port ${config.port}`)
			initSystemNewsTriggers()
		})
	} catch (err) {
		console.error('MongoDB: connection error:', err)
		process.exit(1)
	}
}

start()
