/**
 * routes/export.js
 *
 * GET  /api/export          — exporta todos os dados (recursos, notícias, posts, ratings, comentários)
 *                             como JSON. Quando inclui recursos, exporta também o conteúdo completo
 *                             dos ficheiros AIP para permitir restauro integral fora do MongoDB.
 *
 * POST /api/import          — importa um dump gerado pelo endpoint acima.
 *                             Requer autenticação de admin.
 *                             Aceita JSON legado ou multipart/form-data com dumpFile.
 *                             Estratégia: upsert por _id para ser idempotente (pode ser chamado várias vezes).
 *
 * Nota: o dump inclui também os ficheiros do AIP em base64 para permitir
 * restore completo do MongoDB e do storage em disco no ambiente de destino.
 */

const express = require('express')
const multer = require('multer')

const exportController = require('../controllers/exportController')
const { config } = require('../lib/config')
const { jsonError } = require('../lib/http')
const { requireLevel } = require('../middleware/auth')

const router = express.Router()
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: config.dataTransfer.maxImportFileSizeBytes,
		fieldSize: 20 * 1024 * 1024,
	},
})

function processarUploadDump(req, res, next) {
	upload.single('dumpFile')(req, res, (err) => {
		if (!err) return next()
		if (err.code === 'LIMIT_FILE_SIZE') {
			return jsonError(res, 400, {
				code: 'DUMP_FILE_TOO_LARGE',
				message: 'ficheiro de dump excede o tamanho máximo suportado pela API',
			})
		}
		if (err.code === 'LIMIT_FIELD_VALUE') {
			return jsonError(res, 400, {
				code: 'DUMP_TEXT_TOO_LARGE',
				message: 'conteúdo JSON em texto excede o tamanho suportado; usa dumpFile',
			})
		}
		return next(err)
	})
}


// GET /api/export
router.get('/export', requireLevel('admin'), exportController.exportAll)


// POST /api/import
// Recebe o dump JSON produzido pelo GET /api/export

router.post('/import', requireLevel('admin'), processarUploadDump, exportController.importAll)

module.exports = router
