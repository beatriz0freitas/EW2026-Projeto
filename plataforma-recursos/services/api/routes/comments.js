const express = require('express')

const commentsController = require('../controllers/commentsController')
const { requireAuth } = require('../middleware/auth')
const {
	validarCamposTextoObrigatoriosNoBody,
	validarPaginacaoNaQuery,
} = require('../middleware/validate')

const router = express.Router()

// GET /api/posts/:id/comments
router.get('/posts/:id/comments', validarPaginacaoNaQuery(), commentsController.listByPost)

// POST /api/posts/:id/comments
router.post('/posts/:id/comments', requireAuth, validarCamposTextoObrigatoriosNoBody(['texto']), commentsController.createByPost)

// DELETE /api/posts/:id/comments/:cid
router.delete('/posts/:id/comments/:cid', requireAuth, commentsController.deleteByPost)

module.exports = router

