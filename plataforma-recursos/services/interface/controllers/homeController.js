const { apiRequest } = require('../lib/http')

async function index(req, res) {
	const [newsResponse, resourcesResponse, postsResponse] = await Promise.all([
		apiRequest('/news?limit=5', {
			token: req.session.token,
			req,
		}),
		apiRequest('/resources?limit=6', {
			token: req.session.token,
			req,
		}),
		apiRequest('/posts?limit=1', {
			token: req.session.token,
			req,
		}),
	])

	const resources = resourcesResponse.ok ? resourcesResponse.data?.items || [] : []
	const news = newsResponse.ok ? newsResponse.data?.items || [] : []
	const resourceTypes = new Set(resources.map((item) => item?.metadata?.resource?.tipo).filter(Boolean))

	res.render('index', {
		title: 'Plataforma de Recursos Educativos',
		news,
		resources,
		stats: {
			resourcesTotal: resourcesResponse.ok ? Number(resourcesResponse.data?.total || resources.length) : resources.length,
			postsTotal: postsResponse.ok ? Number(postsResponse.data?.total || postsResponse.data?.items?.length || 0) : 0,
			newsTotal: newsResponse.ok ? Number(newsResponse.data?.total || news.length) : news.length,
			resourceTypesTotal: resourceTypes.size,
		},
	})
}

module.exports = {
	index,
}
