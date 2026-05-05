const express = require('express')
const multer = require('multer')

const adminController = require('../controllers/adminController')
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
			return adminController.renderImportWithError(
				req,
				res,
				'O ficheiro escolhido é maior do que a plataforma consegue receber.'
			)
		}
		if (err.code === 'LIMIT_FIELD_VALUE') {
			return adminController.renderImportWithError(
				req,
				res,
				'O conteúdo colado é demasiado grande. Usa o ficheiro exportado.'
			)
		}
		return next(err)
	})
}

router.use(requireSession, requireLevel('admin'))

router.get('/users', routeAsync(adminController.listUsers))
router.post('/users/:id/role', routeAsync(adminController.updateUserRole))
router.post('/users/:id/delete', routeAsync(adminController.deleteUser))
router.get('/news', routeAsync(adminController.listNews))
router.post('/news', routeAsync(adminController.createNews))
router.post('/news/:id/delete', routeAsync(adminController.deleteNews))
router.get('/export', routeAsync(adminController.exportData))
router.get('/import', adminController.showImportForm)
router.post('/import', processarUploadDump, routeAsync(adminController.importData))
router.get('/data', adminController.showData)
router.get('/audit', routeAsync(adminController.listAudit))

module.exports = router
