const ESCOPOS_DADOS_VALIDOS = new Set(['all', 'resources', 'news'])
const TIPOS_NOTICIA_VALIDOS = new Set(['manual', 'system'])
const VISIBILIDADES_RECURSO_VALIDAS = new Set(['publico', 'privado'])

const DEFINICOES_FILTROS_DADOS = {
	scope: {
		label: 'Incluído',
		normalizar: (valor) => {
			const scope = String(valor || 'all').trim().toLowerCase()
			return ESCOPOS_DADOS_VALIDOS.has(scope) ? scope : 'all'
		},
		estaAtivo: (valor) => valor !== 'all',
		formatarResumo: (valor) =>
			valor === 'resources' ? 'Só recursos' : valor === 'news' ? 'Só notícias' : 'Tudo',
		omitirNaQuery: (valor) => valor === 'all',
	},
	resourceType: {
		label: 'Tipo de recurso',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	resourceYear: {
		label: 'Ano do recurso',
		normalizar: (valor) => {
			const parsed = Number.parseInt(valor, 10)
			return Number.isInteger(parsed) && parsed >= 0 && parsed <= 3000 ? String(parsed) : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	resourceTheme: {
		label: 'Tema do recurso',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	resourceHashtag: {
		label: 'Etiqueta do recurso',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	resourceVisibility: {
		label: 'Visibilidade do recurso',
		normalizar: (valor) => {
			const visibility = String(valor || '').trim().toLowerCase()
			return VISIBILIDADES_RECURSO_VALIDAS.has(visibility) ? visibility : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor === 'publico' ? 'Público' : valor === 'privado' ? 'Privado' : valor,
		omitirNaQuery: (valor) => !valor,
	},
	resourceProducer: {
		label: 'Produtor do recurso',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	resourceCreatedFrom: {
		label: 'Recurso criado desde',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	resourceCreatedTo: {
		label: 'Recurso criado até',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	newsType: {
		label: 'Origem da notícia',
		normalizar: (valor) => {
			const newsType = String(valor || '').trim().toLowerCase()
			return TIPOS_NOTICIA_VALIDOS.has(newsType) ? newsType : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) =>
			valor === 'manual' ? 'Criadas no painel' : valor === 'system' ? 'Automáticas' : valor,
		omitirNaQuery: (valor) => !valor,
	},
	newsEventType: {
		label: 'Assunto da notícia',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	newsCreatedBy: {
		label: 'Autor da notícia',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	newsPublishedFrom: {
		label: 'Notícia publicada desde',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	newsPublishedTo: {
		label: 'Notícia publicada até',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	recentLimit: {
		label: 'Mais recentes',
		normalizar: (valor) => {
			const parsed = Number.parseInt(valor, 10)
			return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
}

function normalizarData(valor) {
	const texto = String(valor || '').trim()
	if (!texto) return ''
	const timestamp = Date.parse(texto)
	return Number.isNaN(timestamp) ? '' : texto
}

function construirFormularioFiltrosDados(input = {}) {
	return Object.fromEntries(
		Object.entries(DEFINICOES_FILTROS_DADOS).map(([nomeFiltro, definicao]) => [
			nomeFiltro,
			definicao.normalizar(input[nomeFiltro]),
		])
	)
}

function construirQueryFiltrosDados(filtros) {
	const params = new URLSearchParams()

	for (const [nomeFiltro, definicao] of Object.entries(DEFINICOES_FILTROS_DADOS)) {
		const valor = filtros[nomeFiltro]
		if (definicao.omitirNaQuery(valor)) continue
		params.set(nomeFiltro, valor)
	}

	return params
}

function construirResumoFiltrosDados(filtros) {
	return Object.entries(DEFINICOES_FILTROS_DADOS)
		.filter(([nomeFiltro, definicao]) => definicao.estaAtivo(filtros[nomeFiltro]))
		.map(([nomeFiltro, definicao]) => ({
			key: nomeFiltro,
			label: definicao.label,
			value: definicao.formatarResumo(filtros[nomeFiltro]),
		}))
}

module.exports = {
	construirFormularioFiltrosDados,
	construirQueryFiltrosDados,
	construirResumoFiltrosDados,
}
