const express = require('express')

const { serviceProxy } = require('../lib/proxy')

const AUTH_URL = process.env.AUTH_URL || 'http://auth:16027'
const INTERFACE_URL = process.env.INTERFACE_URL || 'http://interface:16026'

const router = express.Router()

const authProxy = serviceProxy(AUTH_URL)
const interfaceAuthPagesProxy = serviceProxy(INTERFACE_URL, {
	pathRewrite: (path, req) => req.originalUrl,
})

// Páginas HTML (Interface) vivem em /auth/*, mas o serviço auth também usa /auth/*.
// No gateway, encaminhar explicitamente as páginas de login/registo/logout para a Interface.
router.use('/login', interfaceAuthPagesProxy)
router.use('/register', interfaceAuthPagesProxy)
router.use('/logout', interfaceAuthPagesProxy)

// Tudo o resto em /auth/* é do serviço auth (API).
router.use('/', authProxy)

module.exports = router

