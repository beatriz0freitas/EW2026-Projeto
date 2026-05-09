const express = require('express')

const indexController = require('../controllers/indexController')
const ingestRouter = require('../oais/ingest')
const accessRouter = require('../oais/access')
const resourcesRouter = require('./resources')
const postsRouter = require('./posts')
const commentsRouter = require('./comments')
const ratingsRouter = require('./ratings')
const newsRouter = require('./news')
const exportRouter = require('./export')
const auditRouter = require('./audit')

const router = express.Router()

router.get('/health', indexController.health)

router.use('/oais', ingestRouter)
router.use('/oais', accessRouter)
router.use('/resources', resourcesRouter)
router.use('/posts', postsRouter)
router.use('/', commentsRouter)
router.use('/', ratingsRouter)
router.use('/news', newsRouter)
router.use('/', exportRouter)
router.use('/', auditRouter)

module.exports = router
