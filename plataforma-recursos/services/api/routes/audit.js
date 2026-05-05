const express = require('express')

const auditController = require('../controllers/auditController')
const { requireLevel } = require('../middleware/auth')
const { requireInternalService } = require('../middleware/internal')

const router = express.Router()

router.get('/audit', requireLevel('admin'), auditController.list)
router.post('/internal/audit', requireInternalService, auditController.createInternal)

module.exports = router
