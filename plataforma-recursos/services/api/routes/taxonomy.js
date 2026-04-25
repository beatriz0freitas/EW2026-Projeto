const express = require('express')

const taxonomyController = require('../controllers/taxonomyController')
const { requireLevel } = require('../middleware/auth')

const router = express.Router()

// GET /api/taxonomy
router.get('/', taxonomyController.list)

// POST /api/taxonomy (admin)
router.post('/', requireLevel('admin'), taxonomyController.create)

// DELETE /api/taxonomy/:id (admin)
router.delete('/:id', requireLevel('admin'), taxonomyController.deleteById)

module.exports = router

