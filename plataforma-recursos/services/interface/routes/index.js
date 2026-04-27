const express = require('express')
const { apiRequest } = require('../lib/http')
const { routeAsync } = require('../lib/web')

const router = express.Router()

router.get(
	'/',
	routeAsync(async (req, res) => {
		const [newsResponse, resourcesResponse] = await Promise.all([
			apiRequest('/news?limit=5', {
				token: req.session.token,
				req,
			}),
			apiRequest('/resources?limit=6', {
				token: req.session.token,
				req,
			}),
		])

		res.render('index', {
			title: 'Plataforma de Recursos Educativos',
			news: newsResponse.ok ? newsResponse.data?.items || [] : [],
			resources: resourcesResponse.ok ? resourcesResponse.data?.items || [] : [],
		})
	})
)

module.exports = router
