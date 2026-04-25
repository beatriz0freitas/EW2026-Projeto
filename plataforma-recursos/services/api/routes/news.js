const express = require('express')

const newsController = require('../controllers/newsController')
const { requireLevel } = require('../middleware/auth')
const { requireInternalService } = require('../middleware/internal')
const {
	validarCamposTextoObrigatoriosNoBody,
	validarPaginacaoNaQuery,
} = require('../middleware/validate')

const router = express.Router()

// GET /api/news
router.get('/', validarPaginacaoNaQuery(), newsController.list)

// POST /api/news (admin)
router.post('/', requireLevel('admin'), validarCamposTextoObrigatoriosNoBody(['titulo', 'conteudo']), newsController.createManual)

// POST /api/news/system (internal service only)
router.post('/system', requireInternalService, validarCamposTextoObrigatoriosNoBody(['titulo', 'conteudo', 'eventType']), newsController.createSystem)

// DELETE /api/news/:id (admin)
router.delete('/:id', requireLevel('admin'), newsController.deleteById)

module.exports = router

