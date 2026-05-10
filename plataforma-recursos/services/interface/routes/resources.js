const express = require('express')
const multer = require('multer')

const resourcesController = require('../controllers/resourcesController')
const { routeAsync, requireSession, requireLevel } = require('../lib/web')

const router = express.Router()
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 },
})

router.use(requireSession)

router.get('/new', requireLevel('produtor'), resourcesController.showCreateForm)
router.post('/new/simple', requireLevel('produtor'), upload.array('ficheiros', 20), routeAsync(resourcesController.createSimple))
router.post('/new', requireLevel('produtor'), upload.single('sip'), routeAsync(resourcesController.createFromSip))
router.get('/:id/dip', routeAsync(resourcesController.downloadDip))
router.get('/', routeAsync(resourcesController.list))
router.get('/:id', routeAsync(resourcesController.detail))
router.get('/:id/edit', requireLevel('produtor'), routeAsync(resourcesController.showEditForm))
router.post('/:id/edit', requireLevel('produtor'), routeAsync(resourcesController.update))
router.post('/:id/delete', requireLevel('produtor'), routeAsync(resourcesController.remove))
router.post('/:id/ratings', routeAsync(resourcesController.rate))

module.exports = router
