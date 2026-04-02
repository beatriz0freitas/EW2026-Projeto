const express = require('express')

const { serviceProxy } = require('../lib/proxy')

const INTERFACE_URL = process.env.INTERFACE_URL || 'http://interface:16026'

const router = express.Router()

router.use('/', serviceProxy(INTERFACE_URL))

module.exports = router

