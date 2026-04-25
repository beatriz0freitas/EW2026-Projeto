const express = require('express')

const { serviceProxy } = require('../lib/proxy')
const { config } = require('../lib/config')

const router = express.Router()

router.use('/', serviceProxy(config.services.interfaceUrl))

module.exports = router

