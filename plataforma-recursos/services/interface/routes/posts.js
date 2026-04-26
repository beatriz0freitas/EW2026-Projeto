const express = require('express')

const { apiRequest } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const router = express.Router()

function getUserId(req) {
	const u = req.session?.user
	return u && (u._id || u.id || u.sub) ? String(u._id || u.id || u.sub) : null
}

function canManagePost(req, post) {
	const u = req.session?.user
	if (!u) return false
	if (u.role === 'admin') return true
	const uid = getUserId(req)
	return uid && String(post.autorId) === uid
}

router.get(
	'/',
	routeAsync(async (req, res) => {
		const list = await apiRequest('/posts?limit=20', {
			token: req.session.token,
			req,
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
		heading: 'Criar post',
		action: '/posts',
		submitLabel: 'Publicar',
		post: { titulo: '', conteudo: '', resourceId: req.query.resourceId || '' },
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
			req,
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
			apiRequest(`/posts/${req.params.id}`, { token: req.session.token, req }),
			apiRequest(`/posts/${req.params.id}/comments?limit=50`, { token: req.session.token, req }),
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

router.get(
	'/:id/edit',
	requireSession,
	requireLevel('produtor'),
	routeAsync(async (req, res) => {
		const postRes = await apiRequest(`/posts/${req.params.id}`, { token: req.session.token, req })
		if (!postRes.ok) {
			return res.status(postRes.status || 500).render('error', {
				title: 'Post não encontrado',
				message: apiErrorMessage(postRes.data, 'Não foi possível carregar o post.'),
			})
		}

		const post = postRes.data.post
		if (!canManagePost(req, post)) {
			req.flashError('Não tem permissões para editar este post.')
			return res.redirect(`/posts/${req.params.id}`)
		}

		res.render('posts/form', {
			title: 'Editar post',
			heading: 'Editar post',
			action: `/posts/${req.params.id}/edit`,
			submitLabel: 'Guardar alterações',
			post: {
				titulo: post.titulo || '',
				conteudo: post.conteudo || '',
				resourceId: post.resourceId || '',
			},
		})
	})
)

router.post(
	'/:id/edit',
	requireSession,
	requireLevel('produtor'),
	routeAsync(async (req, res) => {
		const { titulo, conteudo, resourceId } = req.body
		const updated = await apiRequest(`/posts/${req.params.id}`, {
			method: 'PATCH',
			token: req.session.token,
			body: {
				titulo,
				conteudo,
				resourceId: resourceId || null,
			},
			req,
		})

		if (!updated.ok) {
			req.flashError(apiErrorMessage(updated.data, 'Não foi possível guardar alterações.'))
			return res.redirect(`/posts/${req.params.id}/edit`)
		}

		req.flashSuccess('Post atualizado com sucesso.')
		res.redirect(`/posts/${req.params.id}`)
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
			req,
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
	'/:id/comments/:cid/delete',
	requireSession,
	routeAsync(async (req, res) => {
		const response = await apiRequest(`/posts/${req.params.id}/comments/${req.params.cid}`, {
			method: 'DELETE',
			token: req.session.token,
			req,
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível remover o comentário.'))
			return res.redirect(`/posts/${req.params.id}`)
		}

		req.flashSuccess('Comentário removido.')
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
			req,
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
