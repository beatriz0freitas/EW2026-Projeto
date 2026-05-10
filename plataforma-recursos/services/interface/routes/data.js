const express = require('express')
const multer = require('multer')

const dataController = require('../controllers/dataController')
const { config } = require('../lib/config')
const { routeAsync, requireSession, requireLevel } = require('../lib/web')

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
			return dataController.renderImportWithError(
				req,
				res,
				'O ficheiro escolhido é maior do que a plataforma consegue receber.'
			)
		}
		if (err.code === 'LIMIT_FIELD_VALUE') {
			return dataController.renderImportWithError(
				req,
				res,
				'O conteúdo colado é demasiado grande. Usa o ficheiro exportado.'
			)
		}
		return next(err)
	})
}

router.use(requireSession)

router.get('/', dataController.showData)
router.get('/export', dataController.showExportPage)
router.get('/export/download', routeAsync(dataController.exportData))
router.get('/import', requireLevel('produtor'), dataController.showImportForm)
router.post('/import', requireLevel('produtor'), processarUploadDump, routeAsync(dataController.importData))

module.exports = router