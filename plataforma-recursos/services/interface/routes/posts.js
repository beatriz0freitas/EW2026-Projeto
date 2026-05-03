const express = require('express')

const postsController = require('../controllers/postsController')
const { routeAsync, requireSession } = require('../lib/web')

const router = express.Router()

router.get('/', routeAsync(postsController.list))
router.get('/new', requireSession, routeAsync(postsController.showCreateForm))
router.post('/', requireSession, routeAsync(postsController.create))
router.get('/:id', routeAsync(postsController.detail))
router.get('/:id/edit', requireSession, routeAsync(postsController.showEditForm))
router.post('/:id/edit', requireSession, routeAsync(postsController.update))
router.post('/:id/comments', requireSession, routeAsync(postsController.createComment))
router.post('/:id/comments/:cid/delete', requireSession, routeAsync(postsController.deleteComment))
router.post('/:id/delete', requireSession, routeAsync(postsController.remove))

module.exports = router
