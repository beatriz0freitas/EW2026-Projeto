const { apiRequest } = require('../lib/http')

async function index(req, res) {
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
}

module.exports = {
	index,
}
