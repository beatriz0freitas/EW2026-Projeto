const express = require('express')
const mongoose = require('mongoose')
const { randomUUID } = require('crypto')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const helmet = require('helmet')

const routes = require('./routes')
const swaggerDocument = YAML.load('./swagger.yaml')

const { config } = require('./lib/config')
const { jsonError } = require('./lib/http')

const app = express()

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'", 'unpkg.com', 'cdn.jsdelivr.net'],
				styleSrc: ["'self'", "'unsafe-inline'", 'unpkg.com', 'cdn.jsdelivr.net'],
				imgSrc: ["'self'", 'data:'],
				connectSrc: ["'self'"],
			},
		},
	})
)

app.use(
	cors({
		origin: config.cors.origin,
		credentials: config.cors.credentials,
		methods: config.cors.methods,
		allowedHeaders: config.cors.allowedHeaders,
	})
)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
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
	console.log(`[auth] ${req.method} ${req.url} ${d} [${req.requestId}]`)
	next()
})

mongoose
	.connect(config.mongoUrl)
	.then(() => {
		console.log('Conectado com sucesso ao MongoDB')
		app.listen(config.port, () => {
			console.log(`A ouvir na porta:${config.port}`)
		})
	})
	.catch((err) => {
		console.error('Erro ao conectar ao MongoDB:', err)
		process.exit(1)
	})

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.use('/', routes)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
app.get('/openapi.json', (req, res) => {
	res.json(swaggerDocument)
})

app.use((req, res) => {
	jsonError(res, 404, { code: 'NOT_FOUND', message: 'rota não encontrada' })
})

app.use((err, req, res, next) => {
	console.error(`[auth] unexpected error [${req.requestId || '-'}]:`, err)
	jsonError(res, err?.status || 500, {
		code: err?.code || 'INTERNAL_ERROR',
		message: err?.message || 'erro interno',
	})
})