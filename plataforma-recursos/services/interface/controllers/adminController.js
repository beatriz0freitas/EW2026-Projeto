const { Blob } = require('buffer')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const {
	construirFormularioFiltrosDados,
	construirQueryFiltrosDados,
	construirResumoFiltrosDados,
} = require('../lib/dataTransferFilters')
const { authRequest, apiRequest, apiFetch } = require('../lib/http')
const { apiErrorMessage } = require('../lib/web')

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

async function listUsers(req, res) {
	const response = await authRequest('/users', { token: req.session.token, req })
	if (!response.ok) {
		return res.status(response.status || 500).render('error', {
			title: 'Gestão de utilizadores',
			message: apiErrorMessage(response.data, 'Não foi possível obter os utilizadores.'),
		})
	}
	res.render('admin/users', { title: 'Admin · Utilizadores', users: response.data?.users || [] })
}

async function updateUserRole(req, res) {
	const response = await authRequest(`/users/${req.params.id}`, {
		method: 'PATCH',
		token: req.session.token,
		body: { role: req.body.role },
		req,
	})
	if (!response.ok) {
		req.flashError(apiErrorMessage(response.data, 'Não foi possível atualizar o perfil.'))
		return res.redirect('/admin/users')
	}
	req.flashSuccess('Perfil de utilizador atualizado.')
	res.redirect('/admin/users')
}

async function deleteUser(req, res) {
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
}

async function listNews(req, res) {
	const response = await apiRequest('/news?limit=30', { token: req.session.token, req })
	if (!response.ok) {
		return res.status(response.status || 500).render('error', {
			title: 'Gestão de notícias',
			message: apiErrorMessage(response.data, 'Não foi possível obter as notícias.'),
		})
	}
	res.render('admin/news', { title: 'Admin · Notícias', items: response.data?.items || [] })
}

async function createNews(req, res) {
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
}

async function deleteNews(req, res) {
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
}

async function exportData(req, res) {
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

	const cd = apiRes.headers.get('content-disposition')
	const ct = apiRes.headers.get('content-type')
	const cl = apiRes.headers.get('content-length')
	if (cd) res.setHeader('Content-Disposition', cd)
	if (ct) res.setHeader('Content-Type', ct)
	if (cl) res.setHeader('Content-Length', cl)

	res.status(200)
	if (!apiRes.body) return res.end()
	await pipeline(Readable.fromWeb(apiRes.body), res)
}

function showImportForm(req, res) {
	res.render('admin/import', {
		title: 'Admin · Importar dados',
		filterForm: construirFormularioFiltrosDados(),
		filterSummary: [],
		dumpText: '',
	})
}

async function importData(req, res) {
	const dumpText = String(req.body.dumpText || '').trim()
	const filterForm = construirFormularioFiltrosDados(req.body)
	const hasDumpFile = !!req.file?.buffer?.length

	if (!hasDumpFile && !dumpText) {
		return renderImportWithError(
			req,
			res,
			'Seleciona um ficheiro exportado ou cola o conteúdo no campo alternativo.'
		)
	}

	if (!hasDumpFile) {
		try {
			JSON.parse(dumpText)
		} catch {
			return renderImportWithError(req, res, 'O conteúdo colado não parece válido. Verifica o ficheiro e tenta novamente.')
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
}

function showData(req, res) {
	res.render('admin/data', {
		title: 'Admin · Dados',
		filterForm: construirFormularioFiltrosDados(),
		filterSummary: [],
	})
}

async function listAudit(req, res) {
	const params = new URLSearchParams()
	for (const key of ['action', 'status', 'service', 'actorId', 'targetType', 'targetId', 'from', 'to', 'page']) {
		const value = String(req.query?.[key] || '').trim()
		if (value) params.set(key, value)
	}
	params.set('limit', '30')

	const response = await apiRequest(`/audit?${params.toString()}`, { token: req.session.token, req })
	if (!response.ok) {
		return res.status(response.status || 500).render('error', {
			title: 'Auditoria',
			message: apiErrorMessage(response.data, 'Não foi possível obter os registos de auditoria.'),
		})
	}

	res.render('admin/audit', {
		title: 'Admin · Auditoria',
		items: response.data?.items || [],
		options: response.data?.options || { actions: [], services: [] },
		pagination: {
			page: response.data?.page || 1,
			totalPages: response.data?.totalPages || 1,
			total: response.data?.total || 0,
		},
		filters: {
			action: String(req.query?.action || ''),
			status: String(req.query?.status || ''),
			service: String(req.query?.service || ''),
			actorId: String(req.query?.actorId || ''),
			targetType: String(req.query?.targetType || ''),
			targetId: String(req.query?.targetId || ''),
			from: String(req.query?.from || ''),
			to: String(req.query?.to || ''),
		},
	})
}

module.exports = {
	renderImportWithError,
	listUsers,
	updateUserRole,
	deleteUser,
	listNews,
	createNews,
	deleteNews,
	exportData,
	showImportForm,
	importData,
	showData,
	listAudit,
}
