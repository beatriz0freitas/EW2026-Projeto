const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const routes = require('./routes')
const { config } = require('./lib/config')
const gatewaySwaggerDocument = YAML.load('./swagger.yaml')

const swaggerHubOptions = {
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

// ... resto igual