/**
 * routes/admin.js
 *
 * GET  /admin/export          — proxy do GET /api/export; devolve o ficheiro JSON
 *                               directamente ao browser com Content-Disposition: attachment
 * GET  /admin/import          — formulário de importação (dump file upload + filtros)
 * POST /admin/import          — envia o dump para POST /api/import e mostra resultado
 */

const express = require('express')
const multer = require('multer')
const { Blob } = require('buffer')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const { config } = require('../lib/config')
const {
	construirFormularioFiltrosDados,
	construirQueryFiltrosDados,
	construirResumoFiltrosDados,
} = require('../lib/dataTransferFilters')
const { authRequest, apiRequest, apiFetch } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const router = express.Router()
router.use(requireSession, requireLevel('admin'))
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: config.dataTransfer.maxImportFileSizeBytes,
		fieldSize: 20 * 1024 * 1024,
	},
})

function renderImportWithError(req, res, message, status = 400) {
	const filterForm = construirFormularioFiltrosDados(req.body || {})
	const dumpText = String(req.body?.dumpText || '').trim()
	return res.status(status).render('admin/import', {
		title: 'Admin · Importar dados',
		filterForm,
		filterSummary: construirResumoFiltrosDados(filterForm),
		dumpText,
		importError: message,
	})
}

function processarUploadDump(req, res, next) {
	upload.single('dumpFile')(req, res, (err) => {
		if (!err) return next()
		if (err.code === 'LIMIT_FILE_SIZE') {
			return renderImportWithError(
				req,
				res,
				'O ficheiro de dump excede o tamanho máximo suportado pela interface.'
			)
		}
		if (err.code === 'LIMIT_FIELD_VALUE') {
			return renderImportWithError(
				req,
				res,
				'O conteúdo colado excede o tamanho suportado. Usa o ficheiro de dump exportado.'
			)
		}
		return next(err)
	})
}

// ─── Utilizadores ────────────────────────────────────────────────────────────

router.get('/users', routeAsync(async (req, res) => {
	const response = await authRequest('/users', { token: req.session.token, req })
	if (!response.ok) {
		return res.status(response.status || 500).render('error', {
			title: 'Gestão de utilizadores',
			message: apiErrorMessage(response.data, 'Não foi possível obter os utilizadores.'),
		})
	}
	res.render('admin/users', { title: 'Admin · Utilizadores', users: response.data?.users || [] })
}))

router.post('/users/:id/role', routeAsync(async (req, res) => {
	const response = await authRequest(`/users/${req.params.id}`, {
		method: 'PATCH',
		token: req.session.token,
		body: { role: req.body.role },
		req,
	})
	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível atualizar o role.'))
		return res.redirect('/admin/users')
	}
	req.flashSuccess('Role de utilizador atualizado.')
	res.redirect('/admin/users')
}))

router.post('/users/:id/delete', routeAsync(async (req, res) => {
	const response = await authRequest(`/users/${req.params.id}`, {
		method: 'DELETE',
		token: req.session.token,
		req,
	})
	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível remover o utilizador.'))
		return res.redirect('/admin/users')
	}
	req.flashSuccess('Utilizador removido com sucesso.')
	res.redirect('/admin/users')
}))

// ─── Notícias ─────────────────────────────────────────────────────────────────

router.get('/news', routeAsync(async (req, res) => {
	const response = await apiRequest('/news?limit=30', { token: req.session.token, req })
	if (!response.ok) {
		return res.status(response.status || 500).render('error', {
			title: 'Gestão de notícias',
			message: apiErrorMessage(response.data, 'Não foi possível obter as notícias.'),
		})
	}
	res.render('admin/news', { title: 'Admin · Notícias', items: response.data?.items || [] })
}))

router.post('/news', routeAsync(async (req, res) => {
	const { titulo, conteudo } = req.body
	const response = await apiRequest('/news', {
		method: 'POST',
		token: req.session.token,
		body: { titulo, conteudo },
		req,
	})
	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível criar a notícia.'))
		return res.redirect('/admin/news')
	}
	req.flashSuccess('Notícia criada com sucesso.')
	res.redirect('/admin/news')
}))

router.post('/news/:id/delete', routeAsync(async (req, res) => {
	const response = await apiRequest(`/news/${req.params.id}`, {
		method: 'DELETE',
		token: req.session.token,
		req,
	})
	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível remover a notícia.'))
		return res.redirect('/admin/news')
	}
	req.flashSuccess('Notícia removida com sucesso.')
	res.redirect('/admin/news')
}))

// ─── Export ───────────────────────────────────────────────────────────────────
// Proxy do GET /api/export — faz stream do ficheiro JSON directamente ao browser.
// O Content-Disposition: attachment da API já faz o browser descarregar o ficheiro.

router.get('/export', routeAsync(async (req, res) => {
	const filterForm = construirFormularioFiltrosDados(req.query)
	const query = construirQueryFiltrosDados(filterForm)
	const apiRes = await apiFetch(`/export${query.toString() ? `?${query.toString()}` : ''}`, {
		method: 'GET',
		token: req.session.token,
		req,
	})

	if (!apiRes.ok) {
		let payload = null
		try { payload = await apiRes.json() } catch { payload = null }
		req.flashError(apiErrorMessage(payload, 'Não foi possível exportar os dados.'))
		return res.redirect('/admin/data')
	}

	// Propagar headers de download ao browser
	const cd = apiRes.headers.get('content-disposition')
	const ct = apiRes.headers.get('content-type')
	const cl = apiRes.headers.get('content-length')
	if (cd) res.setHeader('Content-Disposition', cd)
	if (ct) res.setHeader('Content-Type', ct)
	if (cl) res.setHeader('Content-Length', cl)

	res.status(200)
	if (!apiRes.body) return res.end()
	await pipeline(Readable.fromWeb(apiRes.body), res)
}))

// ─── Import ───────────────────────────────────────────────────────────────────
// GET  /admin/import  — mostra formulário com dump file upload
// POST /admin/import  — envia dump para POST /api/import

router.get('/import', (req, res) => {
	res.render('admin/import', {
		title: 'Admin · Importar dados',
		filterForm: construirFormularioFiltrosDados(),
		filterSummary: [],
		dumpText: '',
	})
})

router.post('/import', processarUploadDump, routeAsync(async (req, res) => {
	const dumpText = String(req.body.dumpText || '').trim()
	const filterForm = construirFormularioFiltrosDados(req.body)
	const hasDumpFile = !!req.file?.buffer?.length

	if (!hasDumpFile && !dumpText) {
		return renderImportWithError(
			req,
			res,
			'Seleciona um ficheiro de dump ou cola o JSON no campo alternativo.'
		)
	}

	if (!hasDumpFile) {
		try {
			JSON.parse(dumpText)
		} catch {
			return renderImportWithError(req, res, 'JSON inválido. Verifica o conteúdo colado.')
		}
	}

	const form = new FormData()
	for (const [key, value] of Object.entries(filterForm)) {
		if (value !== undefined && value !== null && value !== '') {
			form.append(key, String(value))
		}
	}

	if (hasDumpFile) {
		form.append(
			'dumpFile',
			new Blob([req.file.buffer], { type: req.file.mimetype || 'application/json' }),
			req.file.originalname || 'ew2026-export.json'
		)
	} else {
		form.append('dump', dumpText)
	}

	const response = await apiFetch('/import', {
		method: 'POST',
		token: req.session.token,
		body: form,
		req,
	})

	let payload = null
	try { payload = await response.json() } catch { payload = null }

	if (!response.ok && response.status !== 207) {
		return renderImportWithError(
			req,
			res,
			apiErrorMessage(payload, 'Não foi possível importar os dados.'),
			response.status || 500
		)
	}

	// status 207 = sucesso parcial — mostrar relatório na mesma página
	const results = payload?.results || {}
	const filtrosAplicados = construirFormularioFiltrosDados(
		payload?.filtersApplied || payload?.selection || filterForm
	)
	res.render('admin/import', {
		title: 'Admin · Importar dados',
		filterForm,
		dumpText,
		filterSummary: construirResumoFiltrosDados(filtrosAplicados),
		importResults: results,
		importOk: payload?.ok === true,
	})
}))

// ─── Dashboard de dados (export + import na mesma página) ─────────────────────

router.get('/data', (req, res) => {
	res.render('admin/data', {
		title: 'Admin · Dados',
		filterForm: construirFormularioFiltrosDados(),
		filterSummary: [],
	})
})

module.exports = router
