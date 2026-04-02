const express = require('express')
const { apiRequest } = require('../lib/http')
const { routeAsync } = require('../lib/web')

const router = express.Router()

router.get(
	'/',
	routeAsync(async (req, res) => {
		const newsResponse = await apiRequest('/news?limit=5', {
			token: req.session.token,
		})

		res.render('index', {
			title: 'Plataforma de Recursos Educativos',
			news: newsResponse.ok ? newsResponse.data?.items || [] : [],
		})
	})
)

module.exports = router

