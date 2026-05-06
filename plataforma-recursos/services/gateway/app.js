const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const routes = require('./routes')
const { config } = require('./lib/config')
const { limitarPedidosGateway } = require('./middleware/rateLimit')
const documentoSwaggerGateway = YAML.load('./swagger.yaml')

const opcoesHubSwagger = {
	explorer: true,
	swaggerOptions: {
		urls: [
			{ name: 'Gateway', url: '/openapi.json' },
			{ name: 'API', url: '/api/openapi.json' },
			{ name: 'Auth', url: '/auth/openapi.json' },
			{ name: 'Interface', url: '/interface/openapi.json' },
		],
		'urls.primaryName': 'Gateway',
	},
}

const app = express()

app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			scriptSrc: ["'self'", "'unsafe-inline'", 'unpkg.com', 'cdn.jsdelivr.net'],
			styleSrc: ["'self'", "'unsafe-inline'", 'unpkg.com', 'cdn.jsdelivr.net'],
			imgSrc: ["'self'", 'data:'],
			connectSrc: ["'self'"],
		},
	},
}))

app.use(cors({
	origin: process.env.CORS_ORIGIN || 'http://localhost:16020',
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}))

app.use(limitarPedidosGateway)

app.use((req, res, next) => {
	const instante = new Date().toISOString().substring(0, 16)
	console.log(`[gateway] ${req.method} ${req.url} ${instante}`)
	next()
})

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.use(
	'/docs',
	swaggerUi.serveFiles(documentoSwaggerGateway, opcoesHubSwagger),
	swaggerUi.setup(documentoSwaggerGateway, opcoesHubSwagger)
)

app.get('/openapi.json', (req, res) => {
	res.json(documentoSwaggerGateway)
})

app.use('/', routes)

app.listen(config.port, () => {
	console.log(`[gateway] à escuta em :${config.port}`)
	console.log(`[gateway] API_URL=${config.services.apiUrl}`)
	console.log(`[gateway] AUTH_URL=${config.services.authUrl}`)
	console.log(`[gateway] INTERFACE_URL=${config.services.interfaceUrl}`)
})