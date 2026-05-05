const ESCOPOS_VALIDOS = new Set(['all', 'resources', 'news', 'users'])

const ORDEM_COLECOES = ['resources', 'news', 'users', 'posts', 'ratings', 'comments', 'aip']

const DEFINICOES_COLECOES = {
	resources: { raiz: true, camposData: ['createdAt'], campoId: '_id' },
	news: { raiz: true, camposData: ['publicadoEm', 'createdAt'], campoId: '_id' },
	users: { raiz: true, camposData: ['data_registo', 'ultimo_acesso'], campoId: '_id' },
	posts: { dependeDe: 'resources', campoReferencia: 'resourceId', campoId: '_id' },
	ratings: { dependeDe: 'resources', campoReferencia: 'resourceId' },
	comments: { dependeDe: 'posts', campoReferencia: 'postId' },
	aip: { dependeDe: 'resources', campoReferencia: 'resourceId' },
}

function normalizarTexto(valor) {
	return String(valor || '').trim()
}

function normalizarTextoMinusculas(valor) {
	return normalizarTexto(valor).toLowerCase()
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

function criarFiltroTextoIgual({ colecoes, obterValor }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => normalizarTextoMinusculas(obterValor(item)) === normalizarTextoMinusculas(valor),
	}
}

function criarFiltroNumeroIgual({ colecoes, obterValor }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => Number(obterValor(item)) === Number(valor),
	}
}

function criarFiltroArrayContem({ colecoes, obterValores }) {
	return {
		colecoes,
		filtrarItem: (item, valor) =>
			obterValores(item)
				.map((entrada) => normalizarTextoMinusculas(entrada))
				.includes(normalizarTextoMinusculas(valor)),
	}
}

function criarFiltroDataMin({ colecoes, obterValor }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => {
			const timestampItem = obterTimestamp(obterValor(item))
			const timestampFiltro = obterTimestamp(valor)
			if (timestampItem === null || timestampFiltro === null) return false
			return timestampItem >= timestampFiltro
		},
	}
}

function criarFiltroDataMax({ colecoes, obterValor }) {
	return {
		colecoes,
		filtrarItem: (item, valor) => {
			const timestampItem = obterTimestamp(obterValor(item))
			const timestampFiltro = obterTimestampFimDia(valor)
			if (timestampItem === null || timestampFiltro === null) return false
			return timestampItem <= timestampFiltro
		},
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
			if (valor === 'resources') return nomeColecao === 'resources'
			if (valor === 'news') return nomeColecao === 'news'
			if (valor === 'users') return nomeColecao === 'users'
			return true
		},
	},
	resourceType: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({
			colecoes: ['resources'],
			obterValor: (item) => item?.metadata?.resource?.tipo,
		}),
	},
	resourceYear: {
		normalizar: (valor) => normalizarInteiro(valor, { min: 0, max: 3000 }),
		estaAtivo: (valor) => Number.isInteger(valor),
		...criarFiltroNumeroIgual({
			colecoes: ['resources'],
			obterValor: (item) => item?.metadata?.resource?.ano,
		}),
	},
	resourceTheme: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({
			colecoes: ['resources'],
			obterValor: (item) => item?.metadata?.resource?.tema,
		}),
	},
	resourceHashtag: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroArrayContem({
			colecoes: ['resources'],
			obterValores: (item) => (Array.isArray(item?.metadata?.resource?.hashtags) ? item.metadata.resource.hashtags : []),
		}),
	},
	resourceVisibility: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({
			colecoes: ['resources'],
			obterValor: (item) => item?.metadata?.resource?.visibilidade,
		}),
	},
	resourceProducer: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({
			colecoes: ['resources'],
			obterValor: (item) => item?.produtor,
		}),
	},
	resourceCreatedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({
			colecoes: ['resources'],
			obterValor: (item) => item?.createdAt,
		}),
	},
	resourceCreatedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({
			colecoes: ['resources'],
			obterValor: (item) => item?.createdAt,
		}),
	},
	newsType: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({
			colecoes: ['news'],
			obterValor: (item) => item?.tipo,
		}),
	},
	newsEventType: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({
			colecoes: ['news'],
			obterValor: (item) => item?.eventType,
		}),
	},
	newsCreatedBy: {
		normalizar: normalizarTexto,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroTextoIgual({
			colecoes: ['news'],
			obterValor: (item) => item?.createdBy,
		}),
	},
	newsPublishedFrom: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMin({
			colecoes: ['news'],
			obterValor: (item) => item?.publicadoEm,
		}),
	},
	newsPublishedTo: {
		normalizar: normalizarData,
		estaAtivo: (valor) => Boolean(valor),
		...criarFiltroDataMax({
			colecoes: ['news'],
			obterValor: (item) => item?.publicadoEm,
		}),
	},
	recentLimit: {
		normalizar: (valor) => normalizarInteiro(valor, { min: 1 }),
		estaAtivo: (valor) => Number.isInteger(valor) && valor > 0,
		colecoes: ['resources', 'news', 'users'],
		transformarColecao: (itens, valor, contexto) =>
			selecionarMaisRecentes(itens, valor, contexto.camposData),
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
	return Object.fromEntries(
		Object.entries(DEFINICOES_FILTROS).map(([nomeFiltro, definicao]) => [
			nomeFiltro,
			definicao.normalizar(input[nomeFiltro]),
		])
	)
}

function filtroEstaAtivo(nomeFiltro, filtros) {
	const definicao = DEFINICOES_FILTROS[nomeFiltro]
	if (!definicao) return false
	return definicao.estaAtivo(filtros[nomeFiltro], filtros)
}

function haFiltrosAtivos(filtros) {
	return Object.keys(DEFINICOES_FILTROS).some((nomeFiltro) => filtroEstaAtivo(nomeFiltro, filtros))
}

function colecaoRaizIncluida(nomeColecao, filtros) {
	const definicaoColecao = DEFINICOES_COLECOES[nomeColecao]
	if (!definicaoColecao?.raiz) return true
	if (!filtroEstaAtivo('scope', filtros)) return true
	return DEFINICOES_FILTROS.scope.incluiColecaoRaiz(nomeColecao, filtros.scope, filtros)
}

function aplicarFiltrosNaColecao(nomeColecao, itens, filtros) {
	let resultado = Array.isArray(itens) ? [...itens] : []

	for (const [nomeFiltro, definicao] of Object.entries(DEFINICOES_FILTROS)) {
		if (nomeFiltro === 'scope' || !filtroEstaAtivo(nomeFiltro, filtros)) continue
		if (!Array.isArray(definicao.colecoes) || !definicao.colecoes.includes(nomeColecao)) continue

		if (typeof definicao.filtrarItem === 'function') {
			resultado = resultado.filter((item) =>
				definicao.filtrarItem(item, filtros[nomeFiltro], { nomeColecao, filtros })
			)
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
		const definicaoColecao = DEFINICOES_COLECOES[nomeColecao]
		let itens = dumpNormalizado[nomeColecao]

		if (definicaoColecao.raiz && !colecaoRaizIncluida(nomeColecao, filtros)) {
			itens = []
		}

		if (definicaoColecao.dependeDe) {
			const idsPermitidos = idsPorColecao[definicaoColecao.dependeDe] || new Set()
			itens = filtrarPorDependencia(itens, idsPermitidos, definicaoColecao.campoReferencia)
		}

		itens = aplicarFiltrosNaColecao(nomeColecao, itens, filtros)
		dumpFiltrado[nomeColecao] = itens
		idsPorColecao[nomeColecao] = construirIndiceIds(nomeColecao, itens)
	}

	return dumpFiltrado
}

module.exports = {
	construirFiltrosTransferencia,
	construirDumpFiltrado,
}
