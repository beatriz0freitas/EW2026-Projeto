const { Blob } = require('buffer')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const {
	construirFormularioFiltrosDados,
	construirPrevisaoTransferencia,
	construirQueryFiltrosDados,
} = require('../lib/dataTransferFilters')
const { authRequest, apiRequest, apiFetch } = require('../lib/http')
const { apiErrorMessage } = require('../lib/web')

const papeisUtilizador = {
	admin: 'Administrador',
	produtor: 'Produtor',
	consumidor: 'Consumidor',
}

const tiposAlvo = {
	resource: 'Recurso',
	comment: 'Comentário',
	post: 'Publicação',
	news: 'Notícia',
	data_dump: 'Dados',
	user: 'Utilizador',
	rating: 'Avaliação',
	audit: 'Auditoria',
}

const acoesAuditoria = {
	'resource.create': 'Criou recurso',
	'resource.update': 'Atualizou recurso',
	'resource.delete': 'Removeu recurso',
	'resource.read': 'Consultou recurso',
	'resource.download': 'Descarregou recurso',
	'comment.create': 'Criou comentário',
	'comment.delete': 'Removeu comentário',
	'comment.read': 'Consultou comentário',
	'post.create': 'Criou publicação',
	'post.update': 'Atualizou publicação',
	'post.delete': 'Removeu publicação',
	'post.read': 'Consultou publicação',
	'news.create': 'Criou notícia',
	'news.delete': 'Removeu notícia',
	'news.read': 'Consultou notícia',
	'data.export': 'Exportou dados',
	'data.import': 'Importou dados',
	'rating.read': 'Consultou avaliação',
	'rating.upsert': 'Registou avaliação',
	'audit.read': 'Consultou histórico de atividade',
	'http.get': 'Fez pedido GET',
	'http.post': 'Fez pedido POST',
	'http.patch': 'Fez pedido PATCH',
	'http.delete': 'Fez pedido DELETE',
}

function capitalizar(texto = '') {
	if (!texto) return ''
	return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function descreverAcao(codigo = '') {
	const acaoConhecida = acoesAuditoria[codigo]
	if (acaoConhecida) return acaoConhecida

	const [dominio, verbo] = String(codigo).split('.')
	if (!dominio || !verbo) return capitalizar(String(codigo || 'Atividade'))

	const nomeDominio = tiposAlvo[dominio] || capitalizar(dominio.replace(/_/g, ' '))
	const verbos = {
		create: 'Criou',
		update: 'Atualizou',
		delete: 'Removeu',
		read: 'Consultou',
		download: 'Descarregou',
		import: 'Importou',
		export: 'Exportou',
		upsert: 'Registou',
	}

	return verbos[verbo] ? `${verbos[verbo]} ${nomeDominio.toLowerCase()}` : capitalizar(String(codigo).replace(/[._]/g, ' '))
}

function descreverAtor(actor = {}) {
	const nomeVisivel = String(actor?.nome || '').trim()
	const idVisivel = String(actor?.id || '').trim()
	const papelVisivel = papeisUtilizador[String(actor?.role || '').trim()] || String(actor?.role || '').trim()

	return {
		principal: nomeVisivel || idVisivel || 'Sistema',
		detalhe: nomeVisivel && idVisivel && nomeVisivel !== idVisivel
			? `${idVisivel}${papelVisivel ? ` · ${papelVisivel}` : ''}`
			: papelVisivel || '',
	}
}

function descreverAlvo(target = {}) {
	const tipo = String(target?.type || '').trim()
	const id = String(target?.id || '').trim()
	const nomeTipo = tiposAlvo[tipo] || capitalizar(tipo.replace(/_/g, ' '))

	if (!tipo && !id) {
		return { principal: 'Sem alvo específico', detalhe: '' }
	}

	return {
		principal: nomeTipo || 'Alvo',
		detalhe: id || '',
	}
}

function construirDetalhesTecnicos(item = {}) {
	const detalhes = []
	if (item.service) detalhes.push({ etiqueta: 'Serviço', valor: item.service })
	if (item.method) detalhes.push({ etiqueta: 'Método', valor: item.method })
	if (item.path) detalhes.push({ etiqueta: 'Caminho', valor: item.path })
	if (item.requestId) detalhes.push({ etiqueta: 'Request ID', valor: item.requestId })
	if (item.statusCode) detalhes.push({ etiqueta: 'Código HTTP', valor: String(item.statusCode) })
	if (item.ip) detalhes.push({ etiqueta: 'IP', valor: item.ip })
	if (item.userAgent) detalhes.push({ etiqueta: 'User-Agent', valor: item.userAgent })
	if (item.metadata && Object.keys(item.metadata).length) {
		detalhes.push({ etiqueta: 'Metadados', valor: JSON.stringify(item.metadata, null, 2) })
	}
	return detalhes
}

function prepararEventoAuditoria(item = {}) {
	const ator = descreverAtor(item.actor)
	const alvo = descreverAlvo(item.target)
	const resultadoSucesso = item.status === 'success'

	return {
		...item,
		acaoLegivel: descreverAcao(item.action),
		acaoCodigo: item.action || '',
		atorPrincipal: ator.principal,
		atorDetalhe: ator.detalhe,
		alvoPrincipal: alvo.principal,
		alvoDetalhe: alvo.detalhe,
		resultadoTexto: resultadoSucesso ? 'Sucesso' : 'Falha',
		resultadoClasse: resultadoSucesso ? 'audit-status audit-status--success' : 'audit-status audit-status--failure',
		detalhesTecnicos: construirDetalhesTecnicos(item),
	}
}

function prepararAcaoFiltro(valor = '') {
	return { valor, etiqueta: descreverAcao(valor) }
}

function renderImportWithError(req, res, message, status = 400) {
	const dumpText = String(req.body?.dumpText || '').trim()
	return res.status(status).render('admin/import', {
		title: 'Admin · Importar dados',
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
		dumpText: '',
	})
}

async function importData(req, res) {
	const dumpText = String(req.body.dumpText || '').trim()
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
	res.render('admin/import', {
		title: 'Admin · Importar dados',
		dumpText,
		importResults: results,
		importOk: payload?.ok === true,
	})
}

function showData(req, res) {
	const filterForm = construirFormularioFiltrosDados(req.query || {})
	res.render('admin/data', {
		title: 'Admin · Dados',
		filterForm,
		transferPreview: construirPrevisaoTransferencia(filterForm, 'exportar'),
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
			title: 'Histórico de atividade',
			message: apiErrorMessage(response.data, 'Não foi possível obter o histórico de atividade.'),
		})
	}

	res.render('admin/audit', {
		title: 'Admin · Histórico de atividade',
		items: (response.data?.items || []).map(prepararEventoAuditoria),
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
		actionOptions: (response.data?.options?.actions || []).sort().map(prepararAcaoFiltro),
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
