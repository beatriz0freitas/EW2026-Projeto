const express = require('express')

const postsController = require('../controllers/postsController')
const { routeAsync, requireSession } = require('../lib/web')

const router = express.Router()

router.use(requireSession)

router.get('/', routeAsync(postsController.list))
router.get('/new', routeAsync(postsController.showCreateForm))
router.post('/', routeAsync(postsController.create))
router.get('/:id', routeAsync(postsController.detail))
router.get('/:id/edit', routeAsync(postsController.showEditForm))
router.post('/:id/edit', routeAsync(postsController.update))
router.post('/:id/comments', routeAsync(postsController.createComment))
router.post('/:id/comments/:cid/delete', routeAsync(postsController.deleteComment))
router.post('/:id/delete', routeAsync(postsController.remove))

module.exports = router
