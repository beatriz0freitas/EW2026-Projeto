const express = require('express')

const homeController = require('../controllers/homeController')
const { routeAsync, requireSession } = require('../lib/web')

const router = express.Router()

router.get('/', requireSession, routeAsync(homeController.index))

module.exports = router
