const express = require('express')
const router = express.Router()

const usersRouter = require('./users')
const sessionsRouter = require('./sessions')
const internalRouter = require('./internal')
const indexController = require('../controllers/indexController')
const { verificaAcesso } = require('../middleware/auth')

// POST /auth/register
router.use('/', usersRouter)

// POST /auth/sessions  (login)
// GET  /auth/sessions/verify
router.use('/sessions', sessionsRouter)
router.use('/internal', internalRouter)

// GET /auth/me  →  atalho: valida token e devolve user completo do DB
router.get('/me', verificaAcesso, indexController.me)

module.exports = router