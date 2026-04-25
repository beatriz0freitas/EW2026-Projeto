const express = require('express')

const postsController = require('../controllers/postsController')
const { requireLevel } = require('../middleware/auth')
const {
	validarCamposTextoObrigatoriosNoBody,
	validarPaginacaoNaQuery,
} = require('../middleware/validate')

const router = express.Router()

// GET /api/posts
router.get('/', validarPaginacaoNaQuery(), postsController.list)

// POST /api/posts
router.post('/', requireLevel('produtor'), validarCamposTextoObrigatoriosNoBody(['titulo', 'conteudo']), postsController.create)

// GET /api/posts/:id
router.get('/:id', postsController.getById)

// PATCH /api/posts/:id
router.patch('/:id', requireLevel('produtor'), postsController.patchById)

// DELETE /api/posts/:id
router.delete('/:id', requireLevel('produtor'), postsController.deleteById)

module.exports = router

