/**
 * routes/admin.js
 *
 * NOVO:
 *   GET  /admin/export          — proxy do GET /api/export; devolve o ficheiro JSON
 *                                 directamente ao browser com Content-Disposition: attachment
 *   GET  /admin/import          — formulário de importação (textarea com JSON)
 *   POST /admin/import          — envia o JSON para POST /api/import e mostra resultado
 */

const express = require('express')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const { config } = require('../lib/config')
const { authRequest, apiRequest } = require('../lib/http')
const { routeAsync, requireSession, requireLevel, apiErrorMessage } = require('../lib/web')

const API_URL = config.services.apiUrl

const router = express.Router()
router.use(requireSession, requireLevel('admin'))

// ─── Utilizadores ────────────────────────────────────────────────────────────

router.get('/users', routeAsync(async (req, res) => {
	const response = await authRequest('/users', { token: req.session.token })
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
	const apiRes = await fetch(`${API_URL}/api/export`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${req.session.token}`,
		},
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
	res.render('admin/import', { title: 'Admin · Importar dados' })
})

router.post('/import', routeAsync(async (req, res) => {
	const raw = (req.body.dump || '').trim()

	// Validação local antes de enviar
	let parsed
	try {
		parsed = JSON.parse(raw)
	} catch {
		req.flashError('JSON inválido. Verifica o conteúdo colado.')
		return res.redirect('/admin/import')
	}

	const response = await apiRequest('/import', {
		method: 'POST',
		token: req.session.token,
		body: parsed,
		req,
	})

	if (!response.ok && response.status !== 207) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível importar os dados.'))
		return res.redirect('/admin/import')
	}

	// status 207 = sucesso parcial — mostrar relatório na mesma página
	const results = response.data?.results || {}
	res.render('admin/import', {
		title: 'Admin · Importar dados',
		importResults: results,
		importOk: response.data?.ok === true,
	})
}))

// ─── Dashboard de dados (export + import na mesma página) ─────────────────────

router.get('/data', (req, res) => {
	res.render('admin/data', { title: 'Admin · Dados' })
})

module.exports = router
