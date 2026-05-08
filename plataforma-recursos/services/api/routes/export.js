/**
 * routes/export.js
 */

const express = require('express')

const exportController = require('../controllers/exportController')
const { config } = require('../lib/config')
const { requireLevel } = require('../middleware/auth')
const { createSingleMemoryUpload } = require('../middleware/upload')

const router = express.Router()
const processarUploadDump = createSingleMemoryUpload({
	fieldName: 'dumpFile',
	maxFileSizeBytes: config.dataTransfer.maxImportFileSizeBytes,
	maxFieldSizeBytes: 20 * 1024 * 1024,
	allowedExtensions: ['.json'],
	allowedMimeTypes: ['application/json', 'text/json'],
	errors: {
		fileTooLarge: {
			code: 'DUMP_FILE_TOO_LARGE',
			message: 'ficheiro de dump excede o tamanho máximo suportado pela API',
		},
		fieldTooLarge: {
			code: 'DUMP_TEXT_TOO_LARGE',
			message: 'conteúdo JSON em texto excede o tamanho suportado; usa dumpFile',
		},
		invalidType: {
			code: 'INVALID_DUMP_FILE_TYPE',
			message: 'o dumpFile tem de ser um ficheiro JSON',
		},
	},
})


// GET /api/export
router.get('/export', requireLevel('consumidor'), exportController.exportAll)


// POST /api/import
// Recebe o dump JSON produzido pelo GET /api/export

router.post('/import', requireLevel('produtor'), processarUploadDump, exportController.importAll)

module.exports = router
