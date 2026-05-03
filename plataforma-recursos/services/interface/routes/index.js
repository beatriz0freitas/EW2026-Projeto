const express = require('express')

const homeController = require('../controllers/homeController')
const { routeAsync } = require('../lib/web')

const router = express.Router()

router.get('/', routeAsync(homeController.index))

module.exports = router
