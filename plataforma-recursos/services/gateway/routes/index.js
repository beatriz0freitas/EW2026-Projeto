const express = require('express')

const apiRouter = require('./api')
const authRouter = require('./auth')
const interfaceRouter = require('./interface')

const router = express.Router()

router.use('/api', apiRouter)
router.use('/auth', authRouter)
router.use('/', interfaceRouter)

module.exports = router

