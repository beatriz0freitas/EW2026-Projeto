const express = require('express')

const internalController = require('../controllers/internalController')
const { requireInternalService } = require('../middleware/internal')

const router = express.Router()

router.get('/stats/users-count', requireInternalService, internalController.usersCount)

module.exports = router
