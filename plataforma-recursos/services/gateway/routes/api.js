const express = require('express')

const { serviceProxy } = require('../lib/proxy')

const API_URL = process.env.API_URL || 'http://api:16025'

const router = express.Router()

router.use(
	'/',
	serviceProxy(API_URL, {
		pathRewrite: (path) => `/api${path}`,
	})
)

module.exports = router

