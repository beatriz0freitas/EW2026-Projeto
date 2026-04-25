/**
 * routes/export.js
 *
 * GET  /api/export          — exporta todos os dados (recursos, taxonomia, notícias, ratings, comentários)
 *                             como JSON. Requer autenticação de admin.
 *
 * POST /api/import          — importa um dump gerado pelo endpoint acima.
 *                             Requer autenticação de admin.
 *                             Estratégia: upsert por _id para ser idempotente (pode ser chamado várias vezes).
 *
 * Nota: os ficheiros AIP em disco NÃO são incluídos no dump JSON — para uma
 * migração completa é necessário copiar também a pasta AIP_DIR separadamente.
 * O dump JSON é suficiente para restaurar os metadados e a estrutura da plataforma.
 */

const express = require('express')

const exportController = require('../controllers/exportController')
const { requireLevel } = require('../middleware/auth')

const router = express.Router()


// GET /api/export
router.get('/export', requireLevel('admin'), exportController.exportAll)


// POST /api/import
// Recebe o dump JSON produzido pelo GET /api/export

router.post('/import', requireLevel('admin'), exportController.importAll)

module.exports = router