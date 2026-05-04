const express = require('express')

const resourcesController = require('../controllers/resourcesController')
const { optionalAuth, requireLevel } = require('../middleware/auth')
const {
	validarPaginacaoNaQuery,
	validarInteiroOpcionalNaQuery,
} = require('../middleware/validate')

const router = express.Router()

// GET /api/resources
router.get('/', optionalAuth, validarPaginacaoNaQuery(), validarInteiroOpcionalNaQuery('ano', { min: 0, max: 3000 }), resourcesController.list)

// GET /api/resources/:id
router.get('/:id', optionalAuth, resourcesController.getById)

// PATCH /api/resources/:id
router.patch('/:id', requireLevel('produtor'), resourcesController.patchById)

// DELETE /api/resources/:id
// Remove o recurso, a rastreabilidade AIP e a pasta AIP em disco.
router.delete('/:id', requireLevel('produtor'), resourcesController.deleteById)

module.exports = router
