const express = require('express')
const router = express.Router()

const usersController = require('../controllers/usersController')
const auth = require('../auth/auth')
const { validarCamposTextoObrigatoriosNoBody } = require('../middleware/validate')

// POST /auth/register
router.post('/register', validarCamposTextoObrigatoriosNoBody(['nome', 'email', 'password']), usersController.register)

// GET /auth/users  (admin: lista todos os utilizadores)
router.get('/users', auth.verificaAcesso, auth.requireAdmin, usersController.listUsers)

// GET /auth/users/:id  (admin ou proprio utilizador)
router.get('/users/:id', auth.verificaAcesso, usersController.getUserById)

// PATCH /auth/users/:id  (admin: atualizar role ou dados)
router.patch('/users/:id', auth.verificaAcesso, auth.requireAdmin, usersController.patchUserById)

// DELETE /auth/users/:id  (admin: desativa utilizador)
router.delete('/users/:id', auth.verificaAcesso, auth.requireAdmin, usersController.deleteUserById)

module.exports = router