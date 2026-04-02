const express = require('express')

const { authRequest, apiRequest } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const router = express.Router()

router.use(requireSession, requireLevel('admin'))

router.get(
	'/users',
	routeAsync(async (req, res) => {
		const response = await authRequest('/users', {
			token: req.session.token,
		})

		if (!response.ok) {
			return res.status(response.status || 500).render('error', {
				title: 'Gestão de utilizadores',
				message: apiErrorMessage(response.data, 'Não foi possível obter os utilizadores.'),
			})
		}

		res.render('admin/users', {
			title: 'Admin · Utilizadores',
			users: response.data?.users || [],
		})
	})
)

router.post(
	'/users/:id/level',
	routeAsync(async (req, res) => {
		const nivel = req.body.nivel
		const response = await authRequest(`/users/${req.params.id}`, {
			method: 'PATCH',
			token: req.session.token,
			body: { nivel },
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível atualizar o nível.'))
			return res.redirect('/admin/users')
		}

		req.flashSuccess('Nível de utilizador atualizado.')
		res.redirect('/admin/users')
	})
)

router.post(
	'/users/:id/delete',
	routeAsync(async (req, res) => {
		const response = await authRequest(`/users/${req.params.id}`, {
			method: 'DELETE',
			token: req.session.token,
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível remover o utilizador.'))
			return res.redirect('/admin/users')
		}

		req.flashSuccess('Utilizador removido com sucesso.')
		res.redirect('/admin/users')
	})
)

router.get(
	'/news',
	routeAsync(async (req, res) => {
		const response = await apiRequest('/news?limit=30', {
			token: req.session.token,
		})

		if (!response.ok) {
			return res.status(response.status || 500).render('error', {
				title: 'Gestão de notícias',
				message: apiErrorMessage(response.data, 'Não foi possível obter as notícias.'),
			})
		}

		res.render('admin/news', {
			title: 'Admin · Notícias',
			items: response.data?.items || [],
		})
	})
)

router.post(
	'/news',
	routeAsync(async (req, res) => {
		const { titulo, conteudo } = req.body
		const response = await apiRequest('/news', {
			method: 'POST',
			token: req.session.token,
			body: { titulo, conteudo },
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível criar a notícia.'))
			return res.redirect('/admin/news')
		}

		req.flashSuccess('Notícia criada com sucesso.')
		res.redirect('/admin/news')
	})
)

router.post(
	'/news/:id/delete',
	routeAsync(async (req, res) => {
		const response = await apiRequest(`/news/${req.params.id}`, {
			method: 'DELETE',
			token: req.session.token,
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível remover a notícia.'))
			return res.redirect('/admin/news')
		}

		req.flashSuccess('Notícia removida com sucesso.')
		res.redirect('/admin/news')
	})
)

module.exports = router

