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
			eyebrow: 'Transferência de dados',
			intro: 'Exporta ou importa dados da plataforma como administrador.',
			exportDescription: 'Por defeito, a exportação descarrega uma cópia completa. Abre os filtros apenas se quiseres restringir os dados a exportar.',
			defaultTransferTitle: 'Por defeito todo o conteúdo da plataforma é exportado.',
			defaultTransferText: 'Se quiseres descarregar apenas uma parte dos dados, abre a filtragem abaixo.',
		}
	}

	if (role === 'produtor') {
		return {
			allowedTransferTypes: ['resources', 'news', 'posts', 'comments', 'ratings'],
			allowImport: true,
			lockResourceVisibility: '',
			showResourceProducerFilter: false,
			pageTitle: 'Dados',
			eyebrow: 'Transferência de dados',
			intro: 'Exporta os recursos públicos e os teus recursos privados, juntamente com publicações, comentários, classificações e notícias relacionadas quando forem seguras.',
			exportDescription: 'A exportação global permite-te exportar recursos públicos ou recursos da tua autoria e conteúdo relacionado que não exponha dados indevidos.',
			defaultTransferTitle: 'Por defeito saem recursos visíveis e conteúdo relacionado seguro.',
			defaultTransferText: 'Se precisares, aplica filtros para reduzir a seleção exportada.',
		}
	}

	return {
		allowedTransferTypes: ['resources', 'news', 'posts', 'comments', 'ratings'],
		allowImport: false,
		lockResourceVisibility: 'publico',
		showResourceProducerFilter: false,
		pageTitle: 'Dados',
		eyebrow: 'Transferência de dados',
		intro: 'Descarrega de uma só vez os recursos públicos disponíveis na plataforma, com publicações, comentários, classificações e notícias relacionadas quando fizer sentido e for seguro.',
		exportDescription: 'A exportação global permite-te exportar recursos públicos ou recursos da tua autoria e conteúdo relacionado que não exponha dados indevidos.',
		defaultTransferTitle: 'Por defeito saem todos os recursos públicos e o respetivo contexto visível.',
		defaultTransferText: 'Se quiseres, aplica filtros para afinar a exportação antes de descarregar o ficheiro.',
	}
}

function construirFilterForm(req) {
	const config = obterConfigTransferencia(req.session?.user)
	const filterForm = construirFormularioFiltrosDados(req.query || {})

	if (!Array.isArray(req.query?.selectedTypes) && !req.query?.selectedTypes && config.allowedTransferTypes.length && config.allowedTransferTypes.length < 6) {
		filterForm.selectedTypes = [...config.allowedTransferTypes]
	}

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
		return res.redirect(`/data/export${query.toString() ? `?${query.toString()}` : ''}`)
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
	const { config } = construirFilterForm(req)
	res.render('data/index', {
		title: config.pageTitle,
		dataActions: {
			export: {
				href: '/data/export',
				label: 'Exportar dados',
				description: config.exportDescription,
			},
			import: config.allowImport ? {
				href: '/data/import',
				label: 'Importar dados',
				description: 'Repõe dados a partir de um ficheiro JSON compatível com o teu perfil e com as tuas permissões.',
			} : null,
		},
		transferConfig: config,
	})
}

function showExportPage(req, res) {
	const { config, filterForm } = construirFilterForm(req)
	res.render('data/export', {
		title: `${config.pageTitle} · Exportar`,
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
	showExportPage,
	showImportForm,
	importData,
}