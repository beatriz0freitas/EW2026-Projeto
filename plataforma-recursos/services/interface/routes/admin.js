/**
 * routes/admin.js
 *
 * GET  /admin/export          — proxy do GET /api/export; devolve o ficheiro JSON
 *                               directamente ao browser com Content-Disposition: attachment
 * GET  /admin/import          — formulário de importação (textarea com JSON + filtros)
 * POST /admin/import          — envia o JSON para POST /api/import e mostra resultado
 */

const express = require('express')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const {
	construirFormularioFiltrosDados,
	construirQueryFiltrosDados,
	construirResumoFiltrosDados,
} = require('../lib/dataTransferFilters')
const { authRequest, apiRequest, apiFetch } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const router = express.Router()
router.use(requireSession, requireLevel('admin'))

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
// GET  /admin/import  — mostra formulário com textarea
// POST /admin/import  — envia JSON para POST /api/import

router.get('/import', (req, res) => {
	res.render('admin/import', {
		title: 'Admin · Importar dados',
		filterForm: construirFormularioFiltrosDados(),
		filterSummary: [],
		dumpValue: '',
	})
})

router.post('/import', routeAsync(async (req, res) => {
	const raw = (req.body.dump || '').trim()
	const filterForm = construirFormularioFiltrosDados(req.body)

	// Validação local antes de enviar
	let parsed
	try {
		parsed = JSON.parse(raw)
	} catch {
		return res.status(400).render('admin/import', {
			title: 'Admin · Importar dados',
			filterForm,
			filterSummary: construirResumoFiltrosDados(filterForm),
			dumpValue: raw,
			importError: 'JSON inválido. Verifica o conteúdo colado.',
		})
	}

	const response = await apiRequest('/import', {
		method: 'POST',
		token: req.session.token,
		body: {
			dump: parsed,
			filters: filterForm,
		},
		req,
	})

	if (!response.ok && response.status !== 207) {
		return res.status(response.status || 500).render('admin/import', {
			title: 'Admin · Importar dados',
			filterForm,
			filterSummary: construirResumoFiltrosDados(filterForm),
			dumpValue: raw,
			importError: apiErrorMessage(response.data, 'Não foi possível importar os dados.'),
		})
	}

	// status 207 = sucesso parcial — mostrar relatório na mesma página
	const results = response.data?.results || {}
	const filtrosAplicados = construirFormularioFiltrosDados(
		response.data?.filtersApplied || response.data?.selection || filterForm
	)
	res.render('admin/import', {
		title: 'Admin · Importar dados',
		filterForm,
		dumpValue: raw,
		filterSummary: construirResumoFiltrosDados(filtrosAplicados),
		importResults: results,
		importOk: response.data?.ok === true,
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
