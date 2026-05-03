const express = require('express')
const multer = require('multer')

const resourcesController = require('../controllers/resourcesController')
const { routeAsync, requireSession, requireLevel } = require('../lib/web')

const router = express.Router()
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 },
})

router.get('/new', requireSession, requireLevel('produtor'), resourcesController.showCreateForm)
router.post('/new/simple', requireSession, requireLevel('produtor'), upload.array('ficheiros', 20), routeAsync(resourcesController.createSimple))
router.post('/new', requireSession, requireLevel('produtor'), upload.single('sip'), routeAsync(resourcesController.createFromSip))
router.get('/:id/dip', routeAsync(resourcesController.downloadDip))
router.get('/', routeAsync(resourcesController.list))
router.get('/:id', routeAsync(resourcesController.detail))
router.get('/:id/edit', requireSession, requireLevel('produtor'), routeAsync(resourcesController.showEditForm))
router.post('/:id/edit', requireSession, requireLevel('produtor'), routeAsync(resourcesController.update))
router.post('/:id/delete', requireSession, requireLevel('produtor'), routeAsync(resourcesController.remove))
router.post('/:id/ratings', requireSession, routeAsync(resourcesController.rate))

module.exports = router
