const { Blob } = require('buffer')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const { apiFetch, apiRequest } = require('../lib/http')
const { apiErrorMessage } = require('../lib/web')
const { normalizarTipoRecurso, tiposBaseRecurso } = require('../lib/resourceTypes')

function buildFilterOptionsFromResources(items = []) {
	const values = {
		tipos: new Set(tiposBaseRecurso()),
		anos: new Set(),
		temas: new Set(),
		hashtags: new Set(),
	}

	for (const item of items) {
		const resource = item?.metadata?.resource || {}

		const tipo = normalizarTipoRecurso(resource.tipo)
		if (tipo) values.tipos.add(tipo)
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

function buildResourceListHref(filters, page) {
	const params = new URLSearchParams()
	params.set('page', String(page))
	for (const key of ['tipo', 'ano', 'tema', 'hashtag']) {
		if (filters[key]) params.set(key, String(filters[key]))
	}
	return `/resources?${params.toString()}`
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

async function buildTopRatedResources(req, items = [], limit = 5) {
	const resources = Array.isArray(items) ? items : []
	if (!resources.length) return []

	const ratings = await Promise.all(
		resources.map(async (item) => {
			const resourceId = item?._id
			if (!resourceId) return null

			const response = await apiRequest(`/resources/${resourceId}/ratings`, {
				token: req.session.token,
				req,
			})

			if (!response.ok) return null

			const media = Number(response.data?.media || 0)
			const total = Number(response.data?.total || 0)
			if (total <= 0) return null

			return {
				_id: String(resourceId),
				titulo: item?.metadata?.resource?.titulo || 'Recurso',
				tipo: item?.metadata?.resource?.tipo || '',
				media,
				total,
			}
		})
	)

	return ratings
		.filter(Boolean)
		.sort((a, b) => b.media - a.media || b.total - a.total || a.titulo.localeCompare(b.titulo, 'pt'))
		.slice(0, limit)
}

function normalizeHashtags(input) {
	return String(input || '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)
}

function appendFormFields(form, fields) {
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined && value !== null && String(value).trim() !== '') {
			form.append(key, String(value))
		}
	}
}

function apiErrorMessageWithDetails(payload, fallback) {
	const base = apiErrorMessage(payload, fallback)
	const details = Array.isArray(payload?.details)
		? payload.details
			.map((detail) => detail?.message)
			.filter(Boolean)
		: []
	if (!details.length) return base
	return `${base}: ${details.join(' ')}`
}

function canManageResource(user, resource) {
	if (!user || !resource) return false
	if (user.role === 'admin') return true
	const uid = String(user._id || user.id || user.sub || '')
	return !!uid && String(resource.produtor) === uid
}

function showCreateForm(req, res) {
	res.render('resources/form', {
		title: 'Submeter recurso',
		suggestions: buildFilterOptionsFromResources(),
	})
}

async function createSimple(req, res) {
	if (!req.files || req.files.length === 0) {
		req.flashError('Submeta pelo menos um ficheiro do recurso.')
		return res.redirect('/resources/new')
	}

	const form = new FormData()
	appendFormFields(form, {
		titulo: req.body.titulo,
		subtitulo: req.body.subtitulo,
		tipo: req.body.tipo,
		ano: req.body.ano,
		tema: req.body.tema,
		hashtags: req.body.hashtags,
		visibilidade: req.body.visibilidade,
		dataCriacao: req.body.dataCriacao,
		descricao: req.body.descricao,
	})

	for (const ficheiro of req.files) {
		form.append(
			'ficheiros',
			new Blob([ficheiro.buffer], { type: ficheiro.mimetype || 'application/octet-stream' }),
			ficheiro.originalname || 'ficheiro'
		)
	}

	const response = await apiFetch('/oais/ingest/simples', {
		method: 'POST',
		token: req.session.token,
		body: form,
		req,
	})

	let payload = null
	try { payload = await response.json() } catch { payload = null }

	if (!response.ok) {
		req.flashError(apiErrorMessageWithDetails(payload, 'Não foi possível submeter o recurso.'))
		return res.redirect('/resources/new')
	}

	const resourceId = payload?.resourceId
	if (!resourceId) {
		req.flashError('Recurso recebido, mas não foi possível abrir a página respetiva.')
		return res.redirect('/resources')
	}

	req.flashSuccess('Recurso submetido com sucesso.')
	res.redirect(`/resources/${resourceId}`)
}

async function createFromSip(req, res) {
	if (!req.file) {
		req.flashError('Ficheiro ZIP preparado em falta.')
		return res.redirect('/resources/new')
	}

	const form = new FormData()
	form.append(
		'sip',
		new Blob([req.file.buffer], { type: req.file.mimetype || 'application/zip' }),
		req.file.originalname || 'sip.zip'
	)

	const response = await apiFetch('/oais/ingest', {
		method: 'POST',
		token: req.session.token,
		body: form,
		req,
	})

	let payload = null
	try { payload = await response.json() } catch { payload = null }

	if (!response.ok) {
		req.flashError(apiErrorMessageWithDetails(payload, 'Não foi possível submeter o recurso.'))
		return res.redirect('/resources/new')
	}

	const resourceId = payload?.resourceId
	if (!resourceId) {
		req.flashError('Recurso recebido, mas não foi possível abrir a página respetiva.')
		return res.redirect('/resources')
	}

	req.flashSuccess('Recurso submetido com sucesso.')
	res.redirect(`/resources/${resourceId}`)
}

async function downloadDip(req, res) {
	const params = new URLSearchParams()
	const files = Array.isArray(req.query.file)
		? req.query.file
		: req.query.file
			? [req.query.file]
			: []
	if (req.query.selection) params.set('selection', req.query.selection)
	for (const file of files) params.append('file', file)

	const query = params.toString()
	const apiRes = await apiFetch(`/oais/access/${req.params.id}${query ? `?${query}` : ''}`, {
		token: req.session?.token,
		req,
	})

	if (!apiRes.ok) {
		let payload = null
		try { payload = await apiRes.json() } catch { payload = null }
		return res.status(apiRes.status || 500).render('error', {
			title: 'Descarregamento indisponível',
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
}

async function list(req, res) {
	const params = new URLSearchParams()
	params.set('limit', '20')
	if (req.query.page) params.set('page', String(req.query.page))
	if (req.query.tipo) params.set('tipo', String(req.query.tipo))
	if (req.query.ano) params.set('ano', String(req.query.ano))
	if (req.query.tema) params.set('tema', String(req.query.tema))
	if (req.query.hashtag) params.set('hashtag', String(req.query.hashtag))

	const [listResponse, resourcesForFilters] = await Promise.all([
		apiRequest(`/resources?${params.toString()}`, {
			token: req.session.token,
			req,
		}),
		fetchAllVisibleResources(req),
	])

	if (!listResponse.ok) {
		return res.status(listResponse.status || 500).render('error', {
			title: 'Recursos indisponíveis',
			message: apiErrorMessage(listResponse.data, 'Não foi possível obter recursos.'),
		})
	}

	const filters = {
		tipo: req.query.tipo || '',
		ano: req.query.ano || '',
		tema: req.query.tema || '',
		hashtag: req.query.hashtag || '',
	}
	const topRatedResources = resourcesForFilters.ok ? await buildTopRatedResources(req, resourcesForFilters.items) : []
	const page = Number(listResponse.data?.page || 1)
	const totalPages = Number(listResponse.data?.totalPages || 1)

	res.render('resources/list', {
		title: 'Recursos',
		items: listResponse.data?.items || [],
		filters,
		activeFiltersCount: Object.values(filters).filter(Boolean).length,
		filterOptions: resourcesForFilters.ok ? buildFilterOptionsFromResources(resourcesForFilters.items) : { tipos: [], anos: [], temas: [], hashtags: [] },
		topRatedResources,
		pagination: {
			page,
			totalPages,
			total: listResponse.data?.total || 0,
			prevHref: page > 1 ? buildResourceListHref(filters, page - 1) : null,
			nextHref: page < totalPages ? buildResourceListHref(filters, page + 1) : null,
		},
	})
}

async function detail(req, res) {
	const isAuthenticated = !!req.session?.token

	const requests = [
		apiRequest(`/resources/${req.params.id}`, { token: req.session.token, req }),
		apiRequest(`/resources/${req.params.id}/ratings`, { token: req.session.token, req }),
		apiRequest(`/posts?resourceId=${req.params.id}&limit=20`, { token: req.session.token, req }),
	]

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
		myRating: myRatingRes?.data?.rating?.stars || null,
	})
}

async function showEditForm(req, res) {
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
		suggestions: resourcesForSuggestions.ok ? buildFilterOptionsFromResources(resourcesForSuggestions.items) : { tipos: [], anos: [], temas: [], hashtags: [] },
	})
}

async function update(req, res) {
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
			tipo: normalizarTipoRecurso(req.body.tipo),
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
		req.flashError(apiErrorMessageWithDetails(response.data, 'Não foi possível guardar o recurso.'))
		return res.redirect(`/resources/${req.params.id}/edit`)
	}

	req.flashSuccess('Recurso atualizado com sucesso.')
	res.redirect(`/resources/${req.params.id}`)
}

async function remove(req, res) {
	const response = await apiRequest(`/resources/${req.params.id}`, {
		method: 'DELETE',
		token: req.session.token,
		req,
	})

	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível eliminar o recurso.'))
		return res.redirect(`/resources/${req.params.id}`)
	}

	req.flashSuccess('Recurso eliminado com sucesso.')
	res.redirect('/resources')
}

async function rate(req, res) {
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
}

module.exports = {
	showCreateForm,
	createSimple,
	createFromSip,
	downloadDip,
	list,
	detail,
	showEditForm,
	update,
	remove,
	rate,
}
