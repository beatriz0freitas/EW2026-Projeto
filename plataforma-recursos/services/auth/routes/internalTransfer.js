const express = require('express')

const internalTransferController = require('../controllers/internalTransferController')
const { requireInternalService } = require('../middleware/internal')

const router = express.Router()

router.get('/transfer/users', requireInternalService, internalTransferController.exportUsers)
router.post('/transfer/users', requireInternalService, internalTransferController.importUsers)

module.exports = router
