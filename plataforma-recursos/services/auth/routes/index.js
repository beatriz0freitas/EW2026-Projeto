const express = require('express')
const router = express.Router()

const usersRouter = require('./users')
const sessionsRouter = require('./sessions')

// POST /auth/register
router.use('/', usersRouter)

// POST /auth/sessions  (login)
// GET  /auth/sessions/verify
router.use('/sessions', sessionsRouter)

module.exports = router
