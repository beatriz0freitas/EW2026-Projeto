const ESCOPOS_DADOS_VALIDOS = new Set(['all', 'resources', 'news', 'users', 'posts', 'ratings', 'comments', 'aip'])
const TIPOS_CONTEUDO_VALIDOS = ['resources', 'news', 'users', 'posts', 'comments', 'ratings']
const ORDENS_QUANTIDADE_VALIDAS = new Set(['recentes', 'antigos'])
const TIPOS_NOTICIA_VALIDOS = new Set(['manual', 'system'])
const VISIBILIDADES_RECURSO_VALIDAS = new Set(['publico', 'privado'])
const ESTADOS_AIP_VALIDOS = new Set(['ok', 'erro'])

const ETIQUETAS_ESCOPO = {
	all: 'Todos os dados',
	resources: 'Recursos',
	news: 'Notícias',
	users: 'Utilizadores',
	posts: 'Publicações',
	ratings: 'Classificações',
	comments: 'Comentários',
	aip: 'AIP',
}

const ETIQUETAS_TIPO_CONTEUDO = {
	resources: 'Recursos',
	news: 'Notícias',
	users: 'Utilizadores',
	posts: 'Publicações',
	comments: 'Comentários',
	ratings: 'Classificações',
}

const ETIQUETAS_ESCOPO_FRASE = {
	all: 'uma cópia completa dos dados',
	resources: 'recursos',
	news: 'notícias',
	users: 'utilizadores',
	posts: 'publicações',
	ratings: 'classificações',
	comments: 'comentários',
	aip: 'informação de preservação AIP',
}

const DEFINICOES_FILTROS_DADOS = {
	scope: {
		label: 'Âmbito base',
		normalizar: (valor) => {
			const scope = String(valor || 'all').trim().toLowerCase()
			return ESCOPOS_DADOS_VALIDOS.has(scope) ? scope : 'all'
		},
		estaAtivo: (valor) => valor !== 'all',
		formatarResumo: (valor) => ETIQUETAS_ESCOPO[valor] || 'Tudo',
		omitirNaQuery: (valor, filtros) => valor === 'all' || (Array.isArray(filtros.selectedTypes) && filtros.selectedTypes.length > 0),
	},
	selectedTypes: {
		label: 'Tipo de conteúdo',
		normalizar: (valor) => normalizarTiposConteudo(valor),
		estaAtivo: (valor) => Array.isArray(valor) && valor.length > 0,
		formatarResumo: (valor) => valor.map((tipo) => ETIQUETAS_TIPO_CONTEUDO[tipo] || tipo).join(', '),
		omitirNaQuery: (valor) => !Array.isArray(valor) || valor.length === 0,
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
	postAuthor: {
		label: 'Autor da publicação',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	postCreatedFrom: {
		label: 'Publicação criada desde',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	postCreatedTo: {
		label: 'Publicação criada até',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	ratingUser: {
		label: 'Utilizador da classificação',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	ratingStars: {
		label: 'Estrelas da classificação',
		normalizar: (valor) => {
			const parsed = Number.parseInt(valor, 10)
			return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? String(parsed) : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	ratingCreatedFrom: {
		label: 'Classificação criada desde',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	ratingCreatedTo: {
		label: 'Classificação criada até',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	commentAuthor: {
		label: 'Autor do comentário',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	commentCreatedFrom: {
		label: 'Comentário criado desde',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	commentCreatedTo: {
		label: 'Comentário criado até',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	aipStatus: {
		label: 'Estado do AIP',
		normalizar: (valor) => {
			const status = String(valor || '').trim().toLowerCase()
			return ESTADOS_AIP_VALIDOS.has(status) ? status : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => (valor === 'ok' ? 'OK' : valor === 'erro' ? 'Erro' : valor),
		omitirNaQuery: (valor) => !valor,
	},
	aipProducer: {
		label: 'Produtor do AIP',
		normalizar: (valor) => String(valor || '').trim(),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	aipCreatedFrom: {
		label: 'AIP ingerido desde',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	aipCreatedTo: {
		label: 'AIP ingerido até',
		normalizar: (valor) => normalizarData(valor),
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	quantityLimit: {
		label: 'Quantidade',
		normalizar: (valor) => {
			const parsed = Number.parseInt(valor, 10)
			return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		formatarResumo: (valor) => valor,
		omitirNaQuery: (valor) => !valor,
	},
	quantityOrder: {
		label: 'Ordenação da quantidade',
		normalizar: (valor) => {
			const ordem = String(valor || '').trim().toLowerCase()
			return ORDENS_QUANTIDADE_VALIDAS.has(ordem) ? ordem : 'recentes'
		},
		estaAtivo: (valor, filtros) => Boolean(filtros.quantityLimit),
		formatarResumo: (valor) => valor === 'antigos' ? 'Mais antigos' : 'Mais recentes',
		omitirNaQuery: (_, filtros) => !filtros.quantityLimit,
	},
}

function normalizarData(valor) {
	const texto = String(valor || '').trim()
	if (!texto) return ''
	const timestamp = Date.parse(texto)
	return Number.isNaN(timestamp) ? '' : texto
}

function normalizarTiposConteudo(valor) {
	const lista = Array.isArray(valor) ? valor : valor ? [valor] : []
	return [...new Set(
		lista
			.flatMap((entrada) => String(entrada || '').split(','))
			.map((entrada) => entrada.trim().toLowerCase())
			.filter((entrada) => TIPOS_CONTEUDO_VALIDOS.includes(entrada))
	)]
}

function obterValorEntrada(input = {}, nome) {
	const valor = input?.[nome]
	if (Array.isArray(valor)) return valor[valor.length - 1]
	return valor
}

function obterValoresEntrada(input = {}, nome) {
	const valor = input?.[nome]
	if (Array.isArray(valor)) return valor
	if (valor === undefined || valor === null || valor === '') return []
	return [valor]
}

function resolverTiposSelecionados(input = {}) {
	return normalizarTiposConteudo(obterValoresEntrada(input, 'selectedTypes'))
}

function resolverScope(input = {}) {
	const scopeBase = String(obterValorEntrada(input, 'scope') || 'all').trim().toLowerCase()
	return ESCOPOS_DADOS_VALIDOS.has(scopeBase) ? scopeBase : 'all'
}

function construirFormularioFiltrosDados(input = {}) {
	const filtros = Object.fromEntries(
		Object.entries(DEFINICOES_FILTROS_DADOS).map(([nomeFiltro, definicao]) => [
			nomeFiltro,
			definicao.normalizar(
				nomeFiltro === 'scope'
					? resolverScope(input)
					: nomeFiltro === 'selectedTypes'
						? resolverTiposSelecionados(input)
						: nomeFiltro === 'quantityLimit'
							? obterValorEntrada(input, 'quantityLimit') || obterValorEntrada(input, 'recentLimit')
							: obterValorEntrada(input, nomeFiltro)
			),
		])
	)

	if (filtros.selectedTypes.length > 0) filtros.scope = 'all'

	return filtros
}

function construirQueryFiltrosDados(filtros) {
	const params = new URLSearchParams()

	for (const [nomeFiltro, definicao] of Object.entries(DEFINICOES_FILTROS_DADOS)) {
		const valor = filtros[nomeFiltro]
		if (definicao.omitirNaQuery(valor, filtros)) continue
		if (Array.isArray(valor)) {
			for (const entrada of valor) params.append(nomeFiltro, entrada)
			continue
		}
		params.set(nomeFiltro, valor)
	}

	return params
}

function construirResumoFiltrosDados(filtros) {
	return Object.entries(DEFINICOES_FILTROS_DADOS)
		.filter(([nomeFiltro, definicao]) => {
			if (nomeFiltro === 'scope' && Array.isArray(filtros.selectedTypes) && filtros.selectedTypes.length > 0) return false
			return definicao.estaAtivo(filtros[nomeFiltro], filtros)
		})
		.map(([nomeFiltro, definicao]) => ({
			key: nomeFiltro,
			label: definicao.label,
			value: definicao.formatarResumo(filtros[nomeFiltro]),
		}))
}

function construirPrevisaoTransferencia(filtros, modo = 'exportar') {
	const resumo = construirResumoFiltrosDados(filtros)
	const tiposTexto = Array.isArray(filtros.selectedTypes) && filtros.selectedTypes.length
		? filtros.selectedTypes.map((tipo) => ETIQUETAS_TIPO_CONTEUDO[tipo] || tipo).join(', ')
		: ''
	const ambitoFrase = tiposTexto || ETIQUETAS_ESCOPO_FRASE[filtros.scope] || 'dados'
	const principal = modo === 'importar'
		? tiposTexto
			? `Vais importar apenas: ${ambitoFrase}.`
			: 'Vais importar todo o conteúdo disponível no ficheiro.'
		: tiposTexto
			? `Vais exportar apenas: ${ambitoFrase}.`
			: 'Vais exportar todo o conteúdo da plataforma.'
	const limite = filtros.quantityLimit
		? `A plataforma vai usar apenas os ${filtros.quantityLimit} itens ${filtros.quantityOrder === 'antigos' ? 'mais antigos' : 'mais recentes'} dentro da seleção atual.`
		: modo === 'importar'
			? 'Sem limite de quantidade: tudo o que corresponder aos filtros pode entrar.'
			: 'Sem limite de quantidade: sai tudo o que corresponder aos filtros.'
	const filtrosEspecificos = resumo.filter((entrada) => !['scope', 'selectedTypes', 'quantityLimit', 'quantityOrder'].includes(entrada.key))

	return {
		principal,
		limite,
		conteudos: tiposTexto,
		filtrosEspecificos,
		temFiltrosEspecificos: filtrosEspecificos.length > 0,
	}
}

module.exports = {
	construirFormularioFiltrosDados,
	construirPrevisaoTransferencia,
	construirQueryFiltrosDados,
}
