const { apiRequest } = require('../lib/http')
const { apiErrorMessage } = require('../lib/web')

function getUserId(req) {
	const user = req.session?.user
	return user && (user._id || user.id || user.sub) ? String(user._id || user.id || user.sub) : null
}

function canManagePost(req, post) {
	const user = req.session?.user
	if (!user) return false
	if (user.role === 'admin') return true
	const uid = getUserId(req)
	return uid && String(post.autorId) === uid
}

async function getAvailableResources(req) {
	const response = await apiRequest('/resources?limit=100', {
		token: req.session.token,
		req,
	})
	return {
		ok: response.ok,
		items: response.ok ? response.data?.items || [] : [],
		message: apiErrorMessage(response.data, 'Não foi possível carregar os recursos disponíveis.'),
	}
}

async function list(req, res) {
	const response = await apiRequest('/posts?limit=20', {
		token: req.session.token,
		req,
	})

	if (!response.ok) {
		return res.status(response.status || 500).render('error', {
			title: 'Publicações indisponíveis',
			message: apiErrorMessage(response.data, 'Não foi possível obter as publicações.'),
		})
	}

	res.render('posts/list', {
		title: 'Publicações',
		items: response.data?.items || [],
		totalPosts: Number(response.data?.total || (response.data?.items || []).length),
	})
}

async function showCreateForm(req, res) {
	const availableResources = await getAvailableResources(req)
	if (!availableResources.ok) req.flashError(availableResources.message)

	res.render('posts/form', {
		title: 'Novo post',
		heading: 'Criar post',
		action: '/posts',
		submitLabel: 'Publicar',
		post: { titulo: '', conteudo: '', resourceId: req.query.resourceId || '' },
		resources: availableResources.items,
	})
}

async function create(req, res) {
	const { titulo, conteudo, resourceId } = req.body

	const created = await apiRequest('/posts', {
		method: 'POST',
		token: req.session.token,
		body: { titulo, conteudo, resourceId: resourceId || undefined },
		req,
	})

	if (!created.ok) {
		req.flashError(apiErrorMessage(created.data, 'Não foi possível criar o post.'))
		const query = resourceId ? `?resourceId=${encodeURIComponent(resourceId)}` : ''
		return res.redirect(`/posts/new${query}`)
	}

	req.flashSuccess('Publicação criada com sucesso.')
	res.redirect(`/posts/${created.data.post._id}`)
}

async function detail(req, res) {
	const [postRes, commentsRes] = await Promise.all([
		apiRequest(`/posts/${req.params.id}`, { token: req.session.token, req }),
		apiRequest(`/posts/${req.params.id}/comments?limit=50`, { token: req.session.token, req }),
	])

	if (!postRes.ok) {
		return res.status(postRes.status || 500).render('error', {
			title: 'Publicação não encontrada',
			message: apiErrorMessage(postRes.data, 'Não foi possível carregar a publicação.'),
		})
	}

	res.render('posts/detail', {
		title: postRes.data?.post?.titulo || 'Detalhe da publicação',
		post: postRes.data.post,
		comments: commentsRes.ok ? commentsRes.data?.items || [] : [],
	})
}

async function showEditForm(req, res) {
	const postRes = await apiRequest(`/posts/${req.params.id}`, { token: req.session.token, req })
	if (!postRes.ok) {
		return res.status(postRes.status || 500).render('error', {
			title: 'Publicação não encontrada',
			message: apiErrorMessage(postRes.data, 'Não foi possível carregar a publicação.'),
		})
	}

	const post = postRes.data.post
	if (!canManagePost(req, post)) {
		req.flashError('Não tem permissões para editar esta publicação.')
		return res.redirect(`/posts/${req.params.id}`)
	}

	const availableResources = await getAvailableResources(req)
	if (!availableResources.ok) req.flashError(availableResources.message)

	res.render('posts/form', {
		title: 'Editar publicação',
		heading: 'Editar publicação',
		action: `/posts/${req.params.id}/edit`,
		submitLabel: 'Guardar alterações',
		post: {
			titulo: post.titulo || '',
			conteudo: post.conteudo || '',
			resourceId: post.resourceId || '',
		},
		resources: availableResources.items,
	})
}

async function update(req, res) {
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

	req.flashSuccess('Publicação atualizada com sucesso.')
	res.redirect(`/posts/${req.params.id}`)
}

async function createComment(req, res) {
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
}

async function deleteComment(req, res) {
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
}

async function remove(req, res) {
	const response = await apiRequest(`/posts/${req.params.id}`, {
		method: 'DELETE',
		token: req.session.token,
		req,
	})

	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível remover a publicação.'))
		return res.redirect(`/posts/${req.params.id}`)
	}

	req.flashSuccess('Publicação removida com sucesso.')
	res.redirect('/posts')
}

module.exports = {
	list,
	showCreateForm,
	create,
	detail,
	showEditForm,
	update,
	createComment,
	deleteComment,
	remove,
}
