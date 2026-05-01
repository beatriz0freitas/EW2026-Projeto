const express = require('express')

const { serviceProxy } = require('../lib/proxy')
const { config } = require('../lib/config')

const router = express.Router()

const authProxy = serviceProxy(config.services.authUrl)
const interfaceAuthPagesProxy = serviceProxy(config.services.interfaceUrl, {
	pathRewrite: (path, req) => req.originalUrl,
})

// Páginas HTML (Interface) vivem em /auth/*, mas o serviço auth também usa /auth/*.
// No gateway, encaminhar explicitamente as páginas de login/registo/logout para a Interface.
router.use('/login', interfaceAuthPagesProxy)
router.use('/register', interfaceAuthPagesProxy)
router.use('/logout', interfaceAuthPagesProxy)
router.use('/google', interfaceAuthPagesProxy)
router.use('/facebook', interfaceAuthPagesProxy)

// Tudo o resto em /auth/* é do serviço auth (API).
router.use('/', authProxy)

module.exports = router

