const express = require('express')
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

app.use((req, res, next) => {
	const d = new Date().toISOString().substring(0, 16)
	console.log(`[gateway] ${req.method} ${req.url} ${d}`)
	next()
})

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.use(
	'/docs',
	swaggerUi.serveFiles(gatewaySwaggerDocument, swaggerHubOptions),
	swaggerUi.setup(gatewaySwaggerDocument, swaggerHubOptions)
)

app.get('/openapi.json', (req, res) => {
	res.json(gatewaySwaggerDocument)
})

app.use('/', routes)

app.listen(config.port, () => {
	console.log(`[gateway] listening on :${config.port}`)
	console.log(`[gateway] API_URL=${config.services.apiUrl}`)
	console.log(`[gateway] AUTH_URL=${config.services.authUrl}`)
	console.log(`[gateway] INTERFACE_URL=${config.services.interfaceUrl}`)
})

