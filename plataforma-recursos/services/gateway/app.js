const express = require('express')
const swaggerUi = require('swagger-ui-express')
const routes = require('./routes')
const { config } = require('./lib/config')

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
	swaggerUi.serve,
	swaggerUi.setup(null, {
		explorer: true,
		swaggerOptions: {
			urls: [
				{ name: 'API', url: '/api/openapi.json' },
				{ name: 'Auth', url: '/auth/openapi.json' },
				{ name: 'Interface', url: '/interface/openapi.json' },
			],
		},
	})
)

app.use('/', routes)

app.listen(config.port, () => {
	console.log(`[gateway] listening on :${config.port}`)
	console.log(`[gateway] API_URL=${config.services.apiUrl}`)
	console.log(`[gateway] AUTH_URL=${config.services.authUrl}`)
	console.log(`[gateway] INTERFACE_URL=${config.services.interfaceUrl}`)
})

