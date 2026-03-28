const express = require('express')

const ingestRouter = require('./oais/ingest')
const accessRouter = require('./oais/access')

const router = express.Router()

router.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

router.use('/oais', ingestRouter)
router.use('/oais', accessRouter)

module.exports = router

