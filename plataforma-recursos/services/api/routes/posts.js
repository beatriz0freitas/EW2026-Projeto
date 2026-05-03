const express = require('express')

const postsController = require('../controllers/postsController')
const { optionalAuth, requireAuth } = require('../middleware/auth')
const {
	validarCamposTextoObrigatoriosNoBody,
	validarPaginacaoNaQuery,
} = require('../middleware/validate')

const router = express.Router()

// GET /api/posts
router.get('/', optionalAuth, validarPaginacaoNaQuery(), postsController.list)

// POST /api/posts
router.post('/', requireAuth, validarCamposTextoObrigatoriosNoBody(['titulo', 'conteudo', 'resourceId']), postsController.create)

// GET /api/posts/:id
router.get('/:id', optionalAuth, postsController.getById)

// PATCH /api/posts/:id
router.patch('/:id', requireAuth, postsController.patchById)

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, postsController.deleteById)

module.exports = router
