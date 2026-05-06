const express = require('express')

const { serviceProxy } = require('../lib/proxy')
const { config } = require('../lib/config')

const router = express.Router()

const authProxy = serviceProxy(config.services.authUrl)
const interfaceAuthPagesProxy = serviceProxy(config.services.interfaceUrl, {
	pathRewrite: (path, req) => req.originalUrl,
})

function denyInternalRoute(req, res) {
	res.status(404).json({
		ok: false,
		error: 'not_found',
		message: 'rota não encontrada',
	})
}

// Páginas HTML (Interface) vivem em /auth/*, mas o serviço auth também usa /auth/*.
// No gateway, encaminhar explicitamente as páginas de login/registo/logout para a Interface.
router.use('/login', interfaceAuthPagesProxy)
router.use('/register', interfaceAuthPagesProxy)
router.use('/logout', interfaceAuthPagesProxy)
router.use('/password-help', interfaceAuthPagesProxy)
router.use('/google', interfaceAuthPagesProxy)
router.use('/facebook', interfaceAuthPagesProxy)

// Rotas usadas apenas entre serviços. A API e a Interface chamam-nas pela rede Docker,
// nunca através da fronteira pública do gateway.
router.all('/sessions/verify', denyInternalRoute)
router.all('/sessions/refresh-server', denyInternalRoute)

// Tudo o resto em /auth/* é do serviço auth (API).
router.use('/', authProxy)

module.exports = router
