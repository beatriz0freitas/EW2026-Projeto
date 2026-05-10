const ESCOPOS_VALIDOS = new Set(['all', 'resources', 'news', 'users', 'posts', 'ratings', 'comments', 'aip'])
const TIPOS_CONTEUDO_VALIDOS = new Set(['resources', 'news', 'users', 'posts', 'comments', 'ratings'])
const ORDENS_QUANTIDADE_VALIDAS = new Set(['recentes', 'antigos'])
const TIPOS_NOTICIA_VALIDOS = new Set(['manual', 'system'])
const VISIBILIDADES_RECURSO_VALIDAS = new Set(['publico', 'privado'])
const ESTADOS_AIP_VALIDOS = new Set(['ok', 'erro'])

const MAPA_SCOPE_COLECOES = {
	resources: ['resources'],
	news: ['news'],
	users: ['users'],
	posts: ['posts'],
	ratings: ['ratings'],
	comments: ['comments'],
	aip: ['aips', 'aip']
}

const ORDEM_COLECOES = ['resources', 'news', 'users', 'posts', 'ratings', 'comments', 'aips', 'aip']

const DEFINICOES_COLECOES = {
	resources: { raiz: true, camposData: ['createdAt'], campoId: '_id' },
	news: { raiz: true, camposData: ['publicadoEm', 'createdAt'], campoId: '_id' },
	users: { raiz: true, camposData: ['data_registo', 'ultimo_acesso'], campoId: '_id' },
	posts: {
		raiz: true,
		dependeDe: 'resources',
		campoReferencia: 'resourceId',
		campoId: '_id',
		camposData: ['createdAt', 'updatedAt'],
		ignorarDependenciaQuandoScopeDireto: true,
	},
	ratings: {
		raiz: true,
		dependeDe: 'resources',
		campoReferencia: 'resourceId',
		camposData: ['createdAt', 'updatedAt'],
		ignorarDependenciaQuandoScopeDireto: true,
	},
	comments: {
		raiz: true,
		dependeDe: 'posts',
		campoReferencia: 'postId',
		campoId: '_id',
		camposData: ['createdAt'],
		ignorarDependenciaQuandoScopeDireto: true,
	},
	aips: {
		raiz: true,
		dependeDe: 'resources',
		campoReferencia: 'recursoId',
		campoId: '_id',
		camposData: ['dataIngestao'],
		ignorarDependenciaQuandoScopeDireto: true,
	},
	aip: {
		raiz: true,
		dependeDe: 'resources',
		campoReferencia: 'resourceId',
		camposData: [],
		ignorarDependenciaQuandoScopeDireto: true,
	},
}

function normalizarTexto(valor) {
	return String(valor || '').trim()
}

function normalizarListaTexto(valor) {
	const lista = Array.isArray(valor) ? valor : valor === undefined || valor === null || valor === '' ? [] : [valor]
	return lista
		.flatMap((entrada) => String(entrada || '').split(','))
		.map((entrada) => entrada.trim())
		.filter(Boolean)
}

function normalizarTextoMinusculas(valor) {
	return normalizarTexto(valor).toLowerCase()
}

function normalizarTiposConteudo(valor) {
	return [...new Set(
		normalizarListaTexto(valor)
			.map((entrada) => normalizarTextoMinusculas(entrada))
			.filter((entrada) => TIPOS_CONTEUDO_VALIDOS.has(entrada))
	)]
}

function normalizarInteiro(valor, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
	const parsed = Number.parseInt(valor, 10)
	if (!Number.isInteger(parsed)) return null
	if (parsed < min || parsed > max) return null
	return parsed
}

function normalizarData(valor) {
	const texto = normalizarTexto(valor)
	if (!texto) return ''
	const timestamp = Date.parse(texto)
	return Number.isNaN(timestamp) ? '' : texto
}

function obterTimestamp(valor) {
	if (!valor) return null
	const timestamp = Date.parse(valor)
	return Number.isNaN(timestamp) ? null : timestamp
}

function obterTimestampFimDia(valor) {
	const timestamp = obterTimestamp(valor)
	if (timestamp === null) return null
	const data = new Date(timestamp)
	data.setHours(23, 59, 59, 999)
	return data.getTime()
}

function obterRankingData(item, camposData) {
	for (const campo of camposData) {
		const timestamp = obterTimestamp(item?.[campo])
		if (timestamp !== null) return timestamp
	}
	return 0
}

function selecionarMaisRecentes(itens, limite, camposData) {
	if (!limite || itens.length <= limite) return itens
	return [...itens]
		.sort((a, b) => obterRankingData(b, camposData) - obterRankingData(a, camposData))
		.slice(0, limite)
}

function selecionarMaisAntigos(itens, limite, camposData) {
	if (!limite || itens.length <= limite) return itens
	return [...itens]
		.sort((a, b) => obterRankingData(a, camposData) - obterRankingData(b, camposData))
		.slice(0, limite)
}

function escaparRegex(texto) {
	return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function regexIgualSemDistinguirMaiusculas(valor) {
	return new RegExp(`^${escaparRegex(valor)}$`, 'i')
}

function adicionarCondicaoIgual(consulta, campo, valor) {
	consulta[campo] = valor
	return consulta
}

function adicionarOperadorCampo(consulta, campo, operador, valor) {
	const atual = consulta[campo]
	if (atual && typeof atual === 'object' && !Array.isArray(atual) && !(atual instanceof RegExp)) {
		atual[operador] = valor
		return consulta
	}
	consulta[campo] = { [operador]: valor }
	return consulta
}

function criarFiltroTextoIgual({ colecoes, obterValor, campoMongo }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => normalizarTextoMinusculas(obterValor(item)) === normalizarTextoMinusculas(valor),
		construirConsultaMongo: campoMongo
			? (consulta, valor) => adicionarCondicaoIgual(consulta, campoMongo, regexIgualSemDistinguirMaiusculas(valor))
			: null,
	}
}

function criarFiltroNumeroIgual({ colecoes, obterValor, campoMongo }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => Number(obterValor(item)) === Number(valor),
		construirConsultaMongo: campoMongo
			? (consulta, valor) => adicionarCondicaoIgual(consulta, campoMongo, Number(valor))
			: null,
	}
}

function criarFiltroArrayContem({ colecoes, obterValores, campoMongo }) {
	return {
		colecoes,
		filtrarItem: (item, valor) =>
			obterValores(item)
				.map((entrada) => normalizarTextoMinusculas(entrada))
				.includes(normalizarTextoMinusculas(valor)),
			construirConsultaMongo: campoMongo
				? (consulta, valor) => adicionarCondicaoIgual(consulta, campoMongo, regexIgualSemDistinguirMaiusculas(valor))
				: null,
	}
}

function criarFiltroDataMin({ colecoes, obterValor, campoMongo }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => {
			const timestampItem = obterTimestamp(obterValor(item))
			const timestampFiltro = obterTimestamp(valor)
			if (timestampItem === null || timestampFiltro === null) return false
			return timestampItem >= timestampFiltro
		},
		construirConsultaMongo: campoMongo
			? (consulta, valor) => adicionarOperadorCampo(consulta, campoMongo, '$gte', new Date(obterTimestamp(valor)))
			: null,
	}
}

function criarFiltroDataMax({ colecoes, obterValor, campoMongo }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => {
			const timestampItem = obterTimestamp(obterValor(item))
			const timestampFiltro = obterTimestampFimDia(valor)
			if (timestampItem === null || timestampFiltro === null) return false
			return timestampItem <= timestampFiltro
		},
		construirConsultaMongo: campoMongo
			? (consulta, valor) => adicionarOperadorCampo(consulta, campoMongo, '$lte', new Date(obterTimestampFimDia(valor)))
			: null,
	}
}

const DEFINICOES_FILTROS = {
	scope: {
		normalizar: (valor) => {
			const scope = normalizarTextoMinusculas(valor || 'all')
			return ESCOPOS_VALIDOS.has(scope) ? scope : 'all'
		},
		estaAtivo: (valor) => valor !== 'all',
		incluiColecaoRaiz: (nomeColecao, valor) => {
			if (valor === 'all') return true
			return (MAPA_SCOPE_COLECOES[valor] || []).includes(nomeColecao)
		},
	},
	selectedTypes: {
		normalizar: (valor) => normalizarTiposConteudo(valor),
		estaAtivo: (valor) => Array.isArray(valor) && valor.length > 0,
		incluiColecaoRaiz: (nomeColecao, valor) =>
			Array.isArray(valor) && valor.some((tipo) => (MAPA_SCOPE_COLECOES[tipo] || []).includes(nomeColecao)),
	},
	resourceType: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['resources'], obterValor: (item) => item?.metadata?.resource?.tipo, campoMongo: 'metadata.resource.tipo' }),
	},
	resourceYear: {
		normalizar: (valor) => normalizarInteiro(valor, { min: 0, max: 3000 }),
		estaAtivo: (valor) => Number.isInteger(valor),
		...criarFiltroNumeroIgual({ colecoes: ['resources'], obterValor: (item) => item?.metadata?.resource?.ano, campoMongo: 'metadata.resource.ano' }),
	},
	resourceTheme: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['resources'], obterValor: (item) => item?.metadata?.resource?.tema, campoMongo: 'metadata.resource.tema' }),
	},
	resourceHashtag: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroArrayContem({ colecoes: ['resources'], obterValores: (item) => (Array.isArray(item?.metadata?.resource?.hashtags) ? item.metadata.resource.hashtags : []), campoMongo: 'metadata.resource.hashtags' }),
	},
	resourceVisibility: {
		normalizar: (valor) => {
			const visibility = normalizarTextoMinusculas(valor)
			return VISIBILIDADES_RECURSO_VALIDAS.has(visibility) ? visibility : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['resources'], obterValor: (item) => item?.metadata?.resource?.visibilidade, campoMongo: 'metadata.resource.visibilidade' }),
	},
	resourceProducer: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['resources'], obterValor: (item) => item?.produtor, campoMongo: 'produtor' }),
	},
	resourceCreatedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({ colecoes: ['resources'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	resourceCreatedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({ colecoes: ['resources'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	newsType: {
		normalizar: (valor) => {
			const newsType = normalizarTextoMinusculas(valor)
			return TIPOS_NOTICIA_VALIDOS.has(newsType) ? newsType : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['news'], obterValor: (item) => item?.tipo, campoMongo: 'tipo' }),
	},
	newsEventType: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['news'], obterValor: (item) => item?.eventType, campoMongo: 'eventType' }),
	},
	newsCreatedBy: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['news'], obterValor: (item) => item?.createdBy, campoMongo: 'createdBy' }),
	},
	newsPublishedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({ colecoes: ['news'], obterValor: (item) => item?.publicadoEm, campoMongo: 'publicadoEm' }),
	},
	newsPublishedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({ colecoes: ['news'], obterValor: (item) => item?.publicadoEm, campoMongo: 'publicadoEm' }),
	},
	postAuthor: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['posts'], obterValor: (item) => item?.autorId, campoMongo: 'autorId' }),
	},
	postCreatedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({ colecoes: ['posts'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	postCreatedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({ colecoes: ['posts'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	ratingUser: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['ratings'], obterValor: (item) => item?.userId, campoMongo: 'userId' }),
	},
	ratingStars: {
		normalizar: (valor) => normalizarInteiro(valor, { min: 1, max: 5 }),
		estaAtivo: (valor) => Number.isInteger(valor),
		...criarFiltroNumeroIgual({ colecoes: ['ratings'], obterValor: (item) => item?.stars, campoMongo: 'stars' }),
	},
	ratingCreatedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({ colecoes: ['ratings'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	ratingCreatedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({ colecoes: ['ratings'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	commentAuthor: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['comments'], obterValor: (item) => item?.autorId, campoMongo: 'autorId' }),
	},
	commentCreatedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({ colecoes: ['comments'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	commentCreatedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({ colecoes: ['comments'], obterValor: (item) => item?.createdAt, campoMongo: 'createdAt' }),
	},
	aipStatus: {
		normalizar: (valor) => {
			const status = normalizarTextoMinusculas(valor)
			return ESTADOS_AIP_VALIDOS.has(status) ? status : ''
		},
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['aips'], obterValor: (item) => item?.status, campoMongo: 'status' }),
	},
	aipProducer: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({ colecoes: ['aips'], obterValor: (item) => item?.produtor, campoMongo: 'produtor' }),
	},
	aipCreatedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({ colecoes: ['aips'], obterValor: (item) => item?.dataIngestao, campoMongo: 'dataIngestao' }),
	},
	aipCreatedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({ colecoes: ['aips'], obterValor: (item) => item?.dataIngestao, campoMongo: 'dataIngestao' }),
	},
	quantityLimit: {
		normalizar: (valor) => normalizarInteiro(valor, { min: 1 }),
		estaAtivo: (valor) => Number.isInteger(valor) && valor > 0,
		colecoes: ['resources', 'news', 'users', 'posts', 'ratings', 'comments', 'aips'],
		transformarColecao: (itens, valor, contexto) =>
			contexto.filtros.quantityOrder === 'antigos'
				? selecionarMaisAntigos(itens, valor, contexto.camposData)
				: selecionarMaisRecentes(itens, valor, contexto.camposData),
	},
	quantityOrder: {
		normalizar: (valor) => {
			const ordem = normalizarTextoMinusculas(valor)
			return ORDENS_QUANTIDADE_VALIDAS.has(ordem) ? ordem : 'recentes'
		},
		estaAtivo: (_, filtros) => Number.isInteger(filtros.quantityLimit) && filtros.quantityLimit > 0,
	},
}

function normalizarDumpFonte(dump = {}) {
	return Object.fromEntries(
		ORDEM_COLECOES.map((nomeColecao) => [
			nomeColecao,
			Array.isArray(dump[nomeColecao]) ? dump[nomeColecao] : [],
		])
	)
}

function construirFiltrosTransferencia(input = {}) {
	const filtros = Object.fromEntries(
		Object.entries(DEFINICOES_FILTROS).map(([nomeFiltro, definicao]) => [
			nomeFiltro,
			definicao.normalizar(
				nomeFiltro === 'quantityLimit' ? input[nomeFiltro] ?? input.recentLimit : input[nomeFiltro]
			),
		])
	)

	if (filtros.selectedTypes.length > 0) filtros.scope = 'all'

	return filtros
}

function filtroEstaAtivo(nomeFiltro, filtros) {
	const definicao = DEFINICOES_FILTROS[nomeFiltro]
	if (!definicao) return false
	return definicao.estaAtivo(filtros[nomeFiltro], filtros)
}

function haFiltrosAtivos(filtros) {
	return Object.keys(DEFINICOES_FILTROS).some((nomeFiltro) => filtroEstaAtivo(nomeFiltro, filtros))
}

function haFiltrosAtivosNaColecao(nomeColecao, filtros) {
	return Object.entries(DEFINICOES_FILTROS).some(([nomeFiltro, definicao]) => {
		if (nomeFiltro === 'scope' || nomeFiltro === 'selectedTypes' || nomeFiltro === 'quantityOrder') return false
		if (!Array.isArray(definicao.colecoes) || !definicao.colecoes.includes(nomeColecao)) return false
		return filtroEstaAtivo(nomeFiltro, filtros)
	})
}

function scopeIncluiColecaoRaiz(nomeColecao, valorScope = 'all', selectedTypes = []) {
	if (Array.isArray(selectedTypes) && selectedTypes.length > 0) {
		return DEFINICOES_FILTROS.selectedTypes.incluiColecaoRaiz(nomeColecao, selectedTypes)
	}
	if (valorScope === 'all') return true
	return DEFINICOES_FILTROS.scope.incluiColecaoRaiz(nomeColecao, valorScope)
}

function colecaoRaizIncluida(nomeColecao, filtros) {
	const definicaoColecao = DEFINICOES_COLECOES[nomeColecao]
	if (!definicaoColecao?.raiz) return true
	if (filtroEstaAtivo('selectedTypes', filtros)) {
		return scopeIncluiColecaoRaiz(nomeColecao, 'all', filtros.selectedTypes)
	}
	if (!filtroEstaAtivo('scope', filtros)) return true
	return scopeIncluiColecaoRaiz(nomeColecao, filtros.scope)
}

function scopeSelecionaDiretamenteColecao(nomeColecao, filtros) {
	if (filtroEstaAtivo('selectedTypes', filtros)) {
		return scopeIncluiColecaoRaiz(nomeColecao, 'all', filtros.selectedTypes)
	}
	if (!filtroEstaAtivo('scope', filtros)) return false
	if (filtros.scope === 'all') return false
	return scopeIncluiColecaoRaiz(nomeColecao, filtros.scope)
}

function aplicarFiltrosNaColecao(nomeColecao, itens, filtros) {
	let resultado = Array.isArray(itens) ? [...itens] : []

	for (const [nomeFiltro, definicao] of Object.entries(DEFINICOES_FILTROS)) {
		if (nomeFiltro === 'scope' || nomeFiltro === 'selectedTypes' || nomeFiltro === 'quantityOrder' || !filtroEstaAtivo(nomeFiltro, filtros)) continue
		if (!Array.isArray(definicao.colecoes) || !definicao.colecoes.includes(nomeColecao)) continue

		if (typeof definicao.filtrarItem === 'function') {
			resultado = resultado.filter((item) => definicao.filtrarItem(item, filtros[nomeFiltro], { nomeColecao, filtros }))
		}

		if (typeof definicao.transformarColecao === 'function') {
			resultado = definicao.transformarColecao(resultado, filtros[nomeFiltro], {
				nomeColecao,
				filtros,
				camposData: DEFINICOES_COLECOES[nomeColecao]?.camposData || [],
			})
		}
	}

	return resultado
}

function construirIndiceIds(nomeColecao, itens) {
	const campoId = DEFINICOES_COLECOES[nomeColecao]?.campoId
	if (!campoId) return new Set()

	return new Set(
		itens
			.map((item) => item?.[campoId])
			.filter((valor) => valor !== undefined && valor !== null)
			.map((valor) => String(valor))
	)
}

function filtrarPorDependencia(itens, idsPermitidos, campoReferencia) {
	if (!idsPermitidos.size) return []
	return itens.filter((item) => item?.[campoReferencia] && idsPermitidos.has(String(item[campoReferencia])))
}

function construirDumpFiltrado(dumpFonte, filtros) {
	const dumpNormalizado = normalizarDumpFonte(dumpFonte)
	if (!haFiltrosAtivos(filtros)) return dumpNormalizado

	const dumpFiltrado = {}
	const idsPorColecao = {}

	for (const nomeColecao of ORDEM_COLECOES) {
		const definicaoColecao = DEFINICOES_COLECOES[nomeColecao] || {}
		let itens = dumpNormalizado[nomeColecao]

		if (definicaoColecao.raiz && !colecaoRaizIncluida(nomeColecao, filtros)) {
			itens = []
		}

		const deveIgnorarDependencia = definicaoColecao.ignorarDependenciaQuandoScopeDireto && scopeSelecionaDiretamenteColecao(nomeColecao, filtros)

		if (definicaoColecao.dependeDe && !deveIgnorarDependencia) {
			const idsPermitidos = idsPorColecao[definicaoColecao.dependeDe] || new Set()
			itens = filtrarPorDependencia(itens, idsPermitidos, definicaoColecao.campoReferencia)
		}

		itens = aplicarFiltrosNaColecao(nomeColecao, itens, filtros)
		dumpFiltrado[nomeColecao] = itens
		idsPorColecao[nomeColecao] = construirIndiceIds(nomeColecao, itens)
	}

	return dumpFiltrado
}

function construirConsultaMongoColecao(nomeColecao, filtros) {
	const consulta = {}

	for (const [nomeFiltro, definicao] of Object.entries(DEFINICOES_FILTROS)) {
		if (nomeFiltro === 'scope' || nomeFiltro === 'selectedTypes' || nomeFiltro === 'quantityOrder' || !filtroEstaAtivo(nomeFiltro, filtros)) continue
		if (!Array.isArray(definicao.colecoes) || !definicao.colecoes.includes(nomeColecao)) continue
		if (typeof definicao.construirConsultaMongo !== 'function') continue
		definicao.construirConsultaMongo(consulta, filtros[nomeFiltro], { nomeColecao, filtros })
	}

	return consulta
}

function construirOpcoesMongoColecao(nomeColecao, filtros) {
	const opcoes = {}
	const definicaoColecao = DEFINICOES_COLECOES[nomeColecao]
	if (!definicaoColecao) return opcoes

	if (filtroEstaAtivo('quantityLimit', filtros) && DEFINICOES_FILTROS.quantityLimit.colecoes.includes(nomeColecao)) {
		const primeiroCampoData = definicaoColecao.camposData?.[0]
		if (primeiroCampoData) {
			opcoes.sort = { [primeiroCampoData]: filtros.quantityOrder === 'antigos' ? 1 : -1 }
			opcoes.limit = filtros.quantityLimit
		}
	}

	return opcoes
}

module.exports = {
	construirFiltrosTransferencia,
	construirDumpFiltrado,
	construirConsultaMongoColecao,
	construirOpcoesMongoColecao,
	haFiltrosAtivosNaColecao,
	scopeIncluiColecaoRaiz,
}
