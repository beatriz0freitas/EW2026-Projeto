const { Blob } = require('buffer')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const {
	construirFormularioFiltrosDados,
	construirPrevisaoTransferencia,
	construirQueryFiltrosDados,
} = require('../lib/dataTransferFilters')
const { apiFetch } = require('../lib/http')
const { apiErrorMessage } = require('../lib/web')

function obterConfigTransferencia(user = {}) {
	const role = String(user?.role || 'consumidor')

	if (role === 'admin') {
		return {
			allowedTransferTypes: ['resources', 'news', 'users', 'posts', 'comments', 'ratings'],
			allowImport: true,
			lockResourceVisibility: '',
			showResourceProducerFilter: true,
			pageTitle: 'Dados',
			eyebrow: 'Transferência global',
			intro: 'Exporta ou importa dados da plataforma com o nível de acesso de administrador.',
			exportDescription: 'Por defeito, a exportação descarrega uma cópia completa. Abre os filtros apenas se quiseres exportar uma seleção menor.',
			defaultTransferTitle: 'Por defeito sai todo o conteúdo da plataforma.',
			defaultTransferText: 'Se quiseres descarregar apenas uma parte dos dados, abre a filtragem abaixo.',
		}
	}

	if (role === 'produtor') {
		return {
			allowedTransferTypes: ['resources'],
			allowImport: true,
			lockResourceVisibility: '',
			showResourceProducerFilter: false,
			pageTitle: 'Os meus recursos e recursos visíveis',
			eyebrow: 'Transferência de recursos',
			intro: 'Exporta em lote os recursos públicos e os teus recursos privados. Também podes importar lotes de recursos que ficam associados ao teu utilizador.',
			exportDescription: 'A exportação global respeita as tuas permissões: só saem recursos públicos ou recursos teus.',
			defaultTransferTitle: 'Por defeito saem apenas recursos que podes consultar ou gerir.',
			defaultTransferText: 'Se precisares, aplica filtros para reduzir a seleção exportada.',
		}
	}

	return {
		allowedTransferTypes: ['resources'],
		allowImport: false,
		lockResourceVisibility: 'publico',
		showResourceProducerFilter: false,
		pageTitle: 'Recursos públicos',
		eyebrow: 'Transferência de recursos',
		intro: 'Descarrega de uma só vez os recursos públicos disponíveis na plataforma.',
		exportDescription: 'A exportação global respeita as tuas permissões: apenas recursos públicos ficam incluídos.',
		defaultTransferTitle: 'Por defeito saem todos os recursos públicos.',
		defaultTransferText: 'Se quiseres, aplica filtros para afinar a exportação antes de descarregar o ficheiro.',
	}
}

function construirFilterForm(req) {
	const config = obterConfigTransferencia(req.session?.user)
	const filterForm = construirFormularioFiltrosDados(req.query || {})

	if (config.allowedTransferTypes.length === 1) {
		filterForm.selectedTypes = [...config.allowedTransferTypes]
	}

	if (config.lockResourceVisibility) {
		filterForm.resourceVisibility = config.lockResourceVisibility
	}

	return { config, filterForm }
}

function renderImportWithError(req, res, message, status = 400) {
	const config = obterConfigTransferencia(req.session?.user)
	const dumpText = String(req.body?.dumpText || '').trim()
	return res.status(status).render('data/import', {
		title: `${config.pageTitle} · Importar`,
		dumpText,
		importError: message,
		transferConfig: config,
	})
}

async function exportData(req, res) {
	const { filterForm } = construirFilterForm(req)
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
		return res.redirect('/data')
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

function showData(req, res) {
	const { config, filterForm } = construirFilterForm(req)
	res.render('data/index', {
		title: config.pageTitle,
		filterForm,
		transferPreview: construirPrevisaoTransferencia(filterForm, 'exportar'),
		transferConfig: config,
	})
}

function showImportForm(req, res) {
	const config = obterConfigTransferencia(req.session?.user)
	res.render('data/import', {
		title: `${config.pageTitle} · Importar`,
		dumpText: '',
		transferConfig: config,
	})
}

async function importData(req, res) {
	const config = obterConfigTransferencia(req.session?.user)
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
	res.render('data/import', {
		title: `${config.pageTitle} · Importar`,
		dumpText,
		importResults: results,
		importOk: payload?.ok === true,
		transferConfig: config,
	})
}

module.exports = {
	renderImportWithError,
	exportData,
	showData,
	showImportForm,
	importData,
}