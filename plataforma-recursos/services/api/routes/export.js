/**
 * routes/export.js
 *
 * GET  /api/export          — exporta todos os dados (recursos, notícias, posts, ratings, comentários)
 *                             como JSON. Requer autenticação de admin.
 *
 * POST /api/import          — importa um dump gerado pelo endpoint acima.
 *                             Requer autenticação de admin.
 *                             Estratégia: upsert por _id para ser idempotente (pode ser chamado várias vezes).
 *
 * Nota: o dump inclui também os ficheiros do AIP em base64 para permitir
 * restore completo do MongoDB e do storage em disco no ambiente de destino.
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
