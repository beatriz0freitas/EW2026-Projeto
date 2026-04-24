const express = require('express')

const ingestRouter = require('../oais/ingest')
const accessRouter = require('../oais/access')
const resourcesRouter = require('./resources')
const postsRouter = require('./posts')
const commentsRouter = require('./comments')
const ratingsRouter = require('./ratings')
const newsRouter = require('./news')
const taxonomyRouter = require('./taxonomy')
const exportRouter = require('./export')   

const router = express.Router()

router.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

router.use('/oais', ingestRouter)
router.use('/oais', accessRouter)
router.use('/resources', resourcesRouter)
router.use('/posts', postsRouter)
router.use('/', commentsRouter)
router.use('/', ratingsRouter)
router.use('/news', newsRouter)
router.use('/taxonomy', taxonomyRouter)
router.use('/', exportRouter)

module.exports = router