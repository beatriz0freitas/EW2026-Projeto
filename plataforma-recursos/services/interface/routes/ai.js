const express = require('express')

const aiController = require('../controllers/aiController')
const { routeAsync, requireSession } = require('../lib/web')

const router = express.Router()

router.use(requireSession)

router.get('/recommend', aiController.showRecommend)
router.post('/recommend', routeAsync(aiController.recommend))
router.get('/ask', aiController.showAsk)
router.post('/ask', routeAsync(aiController.askQuestion))

module.exports = router
