const express = require('express')

const { apiRequest } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const router = express.Router()

router.get(
	'/',
	routeAsync(async (req, res) => {
		const list = await apiRequest('/posts?limit=20', {
			token: req.session.token,
		})

		if (!list.ok) {
			return res.status(list.status || 500).render('error', {
				title: 'Posts indisponíveis',
				message: apiErrorMessage(list.data, 'Não foi possível obter os posts.'),
			})
		}

		res.render('posts/list', {
			title: 'Posts',
			items: list.data?.items || [],
		})
	})
)

router.get('/new', requireSession, requireLevel('produtor'), (req, res) => {
	res.render('posts/form', {
		title: 'Novo post',
		post: { titulo: '', conteudo: '', resourceId: '' },
	})
})

router.post(
	'/',
	requireSession,
	requireLevel('produtor'),
	routeAsync(async (req, res) => {
		const { titulo, conteudo, resourceId } = req.body

		const created = await apiRequest('/posts', {
			method: 'POST',
			token: req.session.token,
			body: { titulo, conteudo, resourceId: resourceId || undefined },
		})

		if (!created.ok) {
			req.flashError(apiErrorMessage(created.data, 'Não foi possível criar o post.'))
			return res.redirect('/posts/new')
		}

		req.flashSuccess('Post criado com sucesso.')
		res.redirect(`/posts/${created.data.post._id}`)
	})
)

router.get(
	'/:id',
	routeAsync(async (req, res) => {
		const [postRes, commentsRes] = await Promise.all([
			apiRequest(`/posts/${req.params.id}`, { token: req.session.token }),
			apiRequest(`/posts/${req.params.id}/comments?limit=50`, { token: req.session.token }),
		])

		if (!postRes.ok) {
			return res.status(postRes.status || 500).render('error', {
				title: 'Post não encontrado',
				message: apiErrorMessage(postRes.data, 'Não foi possível carregar o post.'),
			})
		}

		res.render('posts/detail', {
			title: postRes.data?.post?.titulo || 'Detalhe do Post',
			post: postRes.data.post,
			comments: commentsRes.ok ? commentsRes.data?.items || [] : [],
		})
	})
)

router.post(
	'/:id/comments',
	requireSession,
	routeAsync(async (req, res) => {
		const texto = (req.body.texto || '').trim()
		const response = await apiRequest(`/posts/${req.params.id}/comments`, {
			method: 'POST',
			token: req.session.token,
			body: { texto },
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível criar o comentário.'))
			return res.redirect(`/posts/${req.params.id}`)
		}

		req.flashSuccess('Comentário adicionado.')
		res.redirect(`/posts/${req.params.id}`)
	})
)

router.post(
	'/:id/delete',
	requireSession,
	requireLevel('produtor'),
	routeAsync(async (req, res) => {
		const response = await apiRequest(`/posts/${req.params.id}`, {
			method: 'DELETE',
			token: req.session.token,
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível remover o post.'))
			return res.redirect(`/posts/${req.params.id}`)
		}

		req.flashSuccess('Post removido com sucesso.')
		res.redirect('/posts')
	})
)

module.exports = router

