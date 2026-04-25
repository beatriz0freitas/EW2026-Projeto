const express = require('express')

const ratingsController = require('../controllers/ratingsController')
const { requireAuth } = require('../middleware/auth')
const { validarInteiroNoBody } = require('../middleware/validate')

const router = express.Router()

// POST /api/resources/:id/ratings
router.post('/resources/:id/ratings', requireAuth, validarInteiroNoBody('stars', { min: 1, max: 5 }), ratingsController.upsertByResource)

// GET /api/resources/:id/ratings
router.get('/resources/:id/ratings', ratingsController.getStatsByResource)

// GET /api/resources/:id/ratings/mine
router.get('/resources/:id/ratings/mine', requireAuth, ratingsController.getMineByResource)

module.exports = router

