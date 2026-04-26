const express = require('express')
const router = express.Router()

const usersController = require('../controllers/usersController')
const { verificaAcesso, requireAdmin } = require('../middleware/auth')
const { validarCamposTextoObrigatoriosNoBody } = require('../middleware/validate')

// POST /auth/register
router.post('/register', validarCamposTextoObrigatoriosNoBody(['nome', 'email', 'password']), usersController.register)

// GET /auth/users  (admin: lista todos os utilizadores)
router.get('/users', verificaAcesso, requireAdmin, usersController.listUsers)

// GET /auth/users/:id  (admin ou proprio utilizador)
router.get('/users/:id', verificaAcesso, usersController.getUserById)

// PATCH /auth/users/:id  (admin: atualizar role ou dados)
router.patch('/users/:id', verificaAcesso, requireAdmin, usersController.patchUserById)

// DELETE /auth/users/:id  (admin: desativa utilizador)
router.delete('/users/:id', verificaAcesso, requireAdmin, usersController.deleteUserById)

module.exports = router