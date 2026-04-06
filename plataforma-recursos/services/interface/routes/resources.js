const express = require('express')
const multer = require('multer')
const { Blob } = require('buffer')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const { apiRequest } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const API_URL = process.env.API_URL || 'http://api:16025'
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 },
})

const router = express.Router()

router.get(
	'/new',
	requireSession,
	requireLevel('produtor'),
	routeAsync(async (req, res) => {
		res.render('resources/form', {
			title: 'Submeter recurso',
		})
	})
)

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
			headers: {
				Authorization: `Bearer ${req.session.token}`,
			},
			body: form,
		})

		let payload = null
		try {
			payload = await response.json()
		} catch {
			payload = null
		}

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

router.get(
	'/:id/dip',
	routeAsync(async (req, res) => {
		const headers = {}
		if (req.session?.token) headers.Authorization = `Bearer ${req.session.token}`

		const apiRes = await fetch(`${API_URL}/api/oais/access/${req.params.id}`, {
			method: 'GET',
			headers,
		})

		if (!apiRes.ok) {
			let payload = null
			try {
				payload = await apiRes.json()
			} catch {
				payload = null
			}

			return res.status(apiRes.status || 500).render('error', {
				title: 'Download indisponível',
				message: apiErrorMessage(payload, 'Não foi possível descarregar o recurso.'),
			})
		}

		const contentType = apiRes.headers.get('content-type')
		const contentDisposition = apiRes.headers.get('content-disposition')
		const contentLength = apiRes.headers.get('content-length')

		if (contentType) res.setHeader('Content-Type', contentType)
		if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition)
		if (contentLength) res.setHeader('Content-Length', contentLength)

		res.status(apiRes.status)
		if (!apiRes.body) return res.end()
		await pipeline(Readable.fromWeb(apiRes.body), res)
	})
)

router.get(
	'/',
	routeAsync(async (req, res) => {
		const params = new URLSearchParams()
		params.set('limit', '20')
		if (req.query.page) params.set('page', String(req.query.page))
		if (req.query.tipo) params.set('tipo', String(req.query.tipo))
		if (req.query.ano) params.set('ano', String(req.query.ano))
		if (req.query.tema) params.set('tema', String(req.query.tema))
		if (req.query.hashtag) params.set('hashtag', String(req.query.hashtag))

		const list = await apiRequest(`/resources?${params.toString()}`, {
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
			filters: {
				tipo: req.query.tipo || '',
				ano: req.query.ano || '',
				tema: req.query.tema || '',
				hashtag: req.query.hashtag || '',
			},
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

