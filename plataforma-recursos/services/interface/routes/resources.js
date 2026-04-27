/**
 * routes/resources.js (interface)
 *
 * ALTERAÇÃO em GET /:id:
 *   Quando o utilizador está autenticado, faz também GET /api/resources/:id/ratings/mine
 *   para saber a sua avaliação actual e passá-la à view como `myRating` (null se não avaliou).
 *
 * Todos os outros pedidos passam `req` nas options para activar o interceptor de 401
 * em lib/http.js.
 */

const express = require('express')
const multer = require('multer')
const { Blob } = require('buffer')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const { config } = require('../lib/config')
const { apiRequest } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const API_URL = config.services.apiUrl
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 },
})

const router = express.Router()

function buildTaxonomyOptions(items = []) {
	const values = {
		tipos: new Set(),
		anos: new Set(),
		temas: new Set(),
		hashtags: new Set(),
	}

	for (const item of items) {
		const resource = item?.metadata?.resource || {}

		if (resource.tipo) values.tipos.add(String(resource.tipo))
		if (resource.ano !== undefined && resource.ano !== null && resource.ano !== '') {
			values.anos.add(String(resource.ano))
		}
		if (resource.tema) values.temas.add(String(resource.tema))
		if (Array.isArray(resource.hashtags)) {
			for (const hashtag of resource.hashtags) {
				if (hashtag) values.hashtags.add(String(hashtag))
			}
		}
	}

	return {
		tipos: Array.from(values.tipos).sort(),
		anos: Array.from(values.anos).sort((a, b) => Number(a) - Number(b)),
		temas: Array.from(values.temas).sort(),
		hashtags: Array.from(values.hashtags).sort(),
	}
}

async function fetchAllVisibleResources(req) {
	const limit = 50
	let page = 1
	let totalPages = 1
	const allItems = []

	do {
		const response = await apiRequest(`/resources?limit=${limit}&page=${page}`, {
			token: req.session.token,
			req,
		})

		if (!response.ok) {
			return { ok: false, items: [] }
		}

		allItems.push(...(response.data?.items || []))
		totalPages = Number(response.data?.totalPages || 1)
		page += 1
	} while (page <= totalPages)

	return { ok: true, items: allItems }
}

function normalizeHashtags(input) {
	return String(input || '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)
}

function canManageResource(user, resource) {
	if (!user || !resource) return false
	if (user.role === 'admin') return true
	const uid = String(user._id || user.id || user.sub || '')
	return !!uid && String(resource.produtor) === uid
}

// GET /resources/new
router.get('/new', requireSession, requireLevel('produtor'), (req, res) => {
	res.render('resources/form', { title: 'Submeter recurso' })
})

// POST /resources/new  — ingestão SIP
router.post(
	'/new',
	requireSession,
	requireLevel('produtor'),
	upload.single('sip'),
	routeAsync(async (req, res) => {
		if (!req.file) {
			req.flashError('Ficheiro SIP (ZIP) em falta.')
			return res.redirect('/resources/new')
		}

		const form = new FormData()
		form.append(
			'sip',
			new Blob([req.file.buffer], { type: req.file.mimetype || 'application/zip' }),
			req.file.originalname || 'sip.zip'
		)

		const response = await fetch(`${API_URL}/api/oais/ingest`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${req.session.token}` },
			body: form,
		})

		let payload = null
		try { payload = await response.json() } catch { payload = null }

		if (!response.ok) {
			req.flashError(apiErrorMessage(payload, 'Não foi possível submeter o recurso.'))
			return res.redirect('/resources/new')
		}

		const resourceId = payload?.resourceId
		if (!resourceId) {
			req.flashError('Submissão concluída, mas não foi possível obter o id do recurso.')
			return res.redirect('/resources')
		}

		req.flashSuccess('Recurso submetido com sucesso.')
		res.redirect(`/resources/${resourceId}`)
	})
)

// GET /resources/:id/dip  — download DIP (stream)
router.get('/:id/dip', routeAsync(async (req, res) => {
	const headers = {}
	if (req.session?.token) headers.Authorization = `Bearer ${req.session.token}`

	const apiRes = await fetch(`${API_URL}/api/oais/access/${req.params.id}`, { headers })

	if (!apiRes.ok) {
		let payload = null
		try { payload = await apiRes.json() } catch { payload = null }
		return res.status(apiRes.status || 500).render('error', {
			title: 'Download indisponível',
			message: apiErrorMessage(payload, 'Não foi possível descarregar o recurso.'),
		})
	}

	const cd = apiRes.headers.get('content-disposition')
	const ct = apiRes.headers.get('content-type')
	const cl = apiRes.headers.get('content-length')
	if (ct) res.setHeader('Content-Type', ct)
	if (cd) res.setHeader('Content-Disposition', cd)
	if (cl) res.setHeader('Content-Length', cl)

	res.status(apiRes.status)
	if (!apiRes.body) return res.end()
	await pipeline(Readable.fromWeb(apiRes.body), res)
}))

// GET /resources  — listagem com filtros e paginação
router.get('/', routeAsync(async (req, res) => {
	const params = new URLSearchParams()
	params.set('limit', '20')
	if (req.query.page)    params.set('page',    String(req.query.page))
	if (req.query.tipo)    params.set('tipo',    String(req.query.tipo))
	if (req.query.ano)     params.set('ano',     String(req.query.ano))
	if (req.query.tema)    params.set('tema',    String(req.query.tema))
	if (req.query.hashtag) params.set('hashtag', String(req.query.hashtag))

	const [list, resourcesForFilters] = await Promise.all([
		apiRequest(`/resources?${params.toString()}`, {
			token: req.session.token,
			req,
		}),
		fetchAllVisibleResources(req),
	])

	if (!list.ok) {
		return res.status(list.status || 500).render('error', {
			title: 'Recursos indisponíveis',
			message: apiErrorMessage(list.data, 'Não foi possível obter recursos.'),
		})
	}

	res.render('resources/list', {
		title: 'Recursos',
		items: list.data?.items || [],
		filters: {
			tipo:    req.query.tipo    || '',
			ano:     req.query.ano     || '',
			tema:    req.query.tema    || '',
			hashtag: req.query.hashtag || '',
		},
		filterOptions: resourcesForFilters.ok ? buildTaxonomyOptions(resourcesForFilters.items) : { tipos: [], anos: [], temas: [], hashtags: [] },
		pagination: {
			page:       list.data?.page       || 1,
			totalPages: list.data?.totalPages || 1,
			total:      list.data?.total      || 0,
		},
	})
}))

// GET /resources/:id  — detalhe do recurso
// ALTERAÇÃO: quando autenticado, busca também a avaliação do utilizador (myRating).
router.get('/:id', routeAsync(async (req, res) => {
	const isAuthenticated = !!req.session?.token

	const requests = [
		apiRequest(`/resources/${req.params.id}`, { token: req.session.token, req }),
		apiRequest(`/resources/${req.params.id}/ratings`, { token: req.session.token, req }),
		apiRequest(`/posts?resourceId=${req.params.id}&limit=20`, { token: req.session.token, req }),
	]

	// Só pede avaliação própria se estiver autenticado
	if (isAuthenticated) {
		requests.push(
			apiRequest(`/resources/${req.params.id}/ratings/mine`, { token: req.session.token, req })
		)
	}

	const [resource, ratings, postsRes, myRatingRes] = await Promise.all(requests)

	if (!resource.ok) {
		return res.status(resource.status || 500).render('error', {
			title: 'Recurso não encontrado',
			message: apiErrorMessage(resource.data, 'Não foi possível carregar o recurso.'),
		})
	}

	res.render('resources/detail', {
		title: resource.data?.resource?.metadata?.resource?.titulo || 'Detalhe do recurso',
		resource: resource.data.resource,
		rating: {
			media: ratings.data?.media || 0,
			total: ratings.data?.total || 0,
		},
		posts: postsRes.ok ? postsRes.data?.items || [] : [],
		canManageResource: canManageResource(req.session?.user, resource.data.resource),
		// myRating: número 1-5 ou null — usado na view para pré-seleccionar a estrela
		myRating: myRatingRes?.data?.rating?.stars || null,
	})
}))

router.get('/:id/edit', requireSession, requireLevel('produtor'), routeAsync(async (req, res) => {
	const [resourceRes, resourcesForSuggestions] = await Promise.all([
		apiRequest(`/resources/${req.params.id}`, { token: req.session.token, req }),
		fetchAllVisibleResources(req),
	])

	if (!resourceRes.ok) {
		return res.status(resourceRes.status || 500).render('error', {
			title: 'Recurso não encontrado',
			message: apiErrorMessage(resourceRes.data, 'Não foi possível carregar o recurso.'),
		})
	}

	const resource = resourceRes.data?.resource
	if (!canManageResource(req.session?.user, resource)) {
		req.flashError('Não tem permissões para editar este recurso.')
		return res.redirect(`/resources/${req.params.id}`)
	}

	const metadataResource = resource?.metadata?.resource || {}
	res.render('resources/edit', {
		title: 'Editar recurso',
		resource,
		form: {
			tipo: metadataResource.tipo || '',
			titulo: metadataResource.titulo || '',
			subtitulo: metadataResource.subtitulo || '',
			ano: metadataResource.ano || '',
			tema: metadataResource.tema || '',
			visibilidade: metadataResource.visibilidade || 'privado',
			dataCriacao: metadataResource.dataCriacao || '',
			hashtags: Array.isArray(metadataResource.hashtags) ? metadataResource.hashtags.join(', ') : '',
		},
		suggestions: resourcesForSuggestions.ok ? buildTaxonomyOptions(resourcesForSuggestions.items) : { tipos: [], anos: [], temas: [], hashtags: [] },
	})
}))

router.post('/:id/edit', requireSession, requireLevel('produtor'), routeAsync(async (req, res) => {
	const currentResourceRes = await apiRequest(`/resources/${req.params.id}`, {
		token: req.session.token,
		req,
	})

	if (!currentResourceRes.ok) {
		return res.status(currentResourceRes.status || 500).render('error', {
			title: 'Recurso não encontrado',
			message: apiErrorMessage(currentResourceRes.data, 'Não foi possível carregar o recurso.'),
		})
	}

	const currentResource = currentResourceRes.data?.resource
	if (!canManageResource(req.session?.user, currentResource)) {
		req.flashError('Não tem permissões para editar este recurso.')
		return res.redirect(`/resources/${req.params.id}`)
	}

	const currentMetadata = currentResource?.metadata && typeof currentResource.metadata === 'object'
		? currentResource.metadata
		: {}
	const currentMetadataResource = currentMetadata.resource && typeof currentMetadata.resource === 'object'
		? currentMetadata.resource
		: {}

	const nextMetadata = {
		...currentMetadata,
		resource: {
			...currentMetadataResource,
			tipo: String(req.body.tipo || '').trim(),
			titulo: String(req.body.titulo || '').trim(),
			subtitulo: String(req.body.subtitulo || '').trim() || undefined,
			ano: req.body.ano ? Number(req.body.ano) : undefined,
			tema: String(req.body.tema || '').trim() || undefined,
			visibilidade: req.body.visibilidade === 'publico' ? 'publico' : 'privado',
			dataCriacao: String(req.body.dataCriacao || '').trim() || undefined,
			hashtags: normalizeHashtags(req.body.hashtags),
		},
	}

	const response = await apiRequest(`/resources/${req.params.id}`, {
		method: 'PATCH',
		token: req.session.token,
		body: { metadata: nextMetadata },
		req,
	})

	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível guardar o recurso.'))
		return res.redirect(`/resources/${req.params.id}/edit`)
	}

	req.flashSuccess('Recurso atualizado com sucesso.')
	res.redirect(`/resources/${req.params.id}`)
}))

// POST /resources/:id/ratings  — submeter avaliação
router.post('/:id/ratings', requireSession, routeAsync(async (req, res) => {
	const stars = Number(req.body.stars)
	const response = await apiRequest(`/resources/${req.params.id}/ratings`, {
		method: 'POST',
		token: req.session.token,
		body: { stars },
		req,
	})

	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível guardar a classificação.'))
		return res.redirect(`/resources/${req.params.id}`)
	}

	req.flashSuccess('Classificação atualizada com sucesso.')
	res.redirect(`/resources/${req.params.id}`)
}))

module.exports = router
