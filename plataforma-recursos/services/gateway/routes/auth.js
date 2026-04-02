const express = require('express')

const { serviceProxy } = require('../lib/proxy')

const AUTH_URL = process.env.AUTH_URL || 'http://auth:16027'

const router = express.Router()

router.use('/', serviceProxy(AUTH_URL))

module.exports = router

