const express = require('express')

const { serviceProxy } = require('../lib/proxy')
const { config } = require('../lib/config')

const router = express.Router()

function denyInternalRoute(req, res) {
	res.status(404).json({
		ok: false,
		error: 'not_found',
		message: 'rota não encontrada',
	})
}

// Endpoint interno usado por auth/api para publicar notícias de sistema.
// Deve ficar acessível apenas na rede Docker, diretamente no serviço API.
router.all('/news/system', denyInternalRoute)
router.all('/internal/audit', denyInternalRoute)

router.use(
	'/',
	serviceProxy(config.services.apiUrl, {
		pathRewrite: (path) => `/api${path}`,
	})
)

module.exports = router
