const express = require('express')

const { apiRequest } = require('../lib/http')
const { routeAsync, requireSession, apiErrorMessage } = require('../lib/web')

const router = express.Router()

router.get(
	'/',
	routeAsync(async (req, res) => {
		const list = await apiRequest('/resources?limit=20', {
			token: req.session.token,
		})

		if (!list.ok) {
			return res.status(list.status || 500).render('error', {
				title: 'Recursos indisponíveis',
				message: apiErrorMessage(list.data, 'Não foi possível obter recursos.'),
			})
		}

		res.render('resources/list', {
			title: 'Recursos',
			items: list.data?.items || [],
			pagination: {
				page: list.data?.page || 1,
				totalPages: list.data?.totalPages || 1,
				total: list.data?.total || 0,
			},
		})
	})
)

router.get(
	'/:id',
	routeAsync(async (req, res) => {
		const [resource, ratings] = await Promise.all([
			apiRequest(`/resources/${req.params.id}`, { token: req.session.token }),
			apiRequest(`/resources/${req.params.id}/ratings`, { token: req.session.token }),
		])

		if (!resource.ok) {
			return res.status(resource.status || 500).render('error', {
				title: 'Recurso não encontrado',
				message: apiErrorMessage(resource.data, 'Não foi possível carregar o recurso.'),
			})
		}

		res.render('resources/detail', {
			title: resource.data?.resource?.metadata?.resource?.titulo || 'Detalhe do Recurso',
			resource: resource.data.resource,
			rating: {
				media: ratings.data?.media || 0,
				total: ratings.data?.total || 0,
			},
		})
	})
)

router.post(
	'/:id/ratings',
	requireSession,
	routeAsync(async (req, res) => {
		const stars = Number(req.body.stars)
		const response = await apiRequest(`/resources/${req.params.id}/ratings`, {
			method: 'POST',
			token: req.session.token,
			body: { stars },
		})

		if (!response.ok) {
			req.flashError(apiErrorMessage(response.data, 'Não foi possível guardar a classificação.'))
			return res.redirect(`/resources/${req.params.id}`)
		}

		req.flashSuccess('Classificação atualizada com sucesso.')
		res.redirect(`/resources/${req.params.id}`)
	})
)

module.exports = router

