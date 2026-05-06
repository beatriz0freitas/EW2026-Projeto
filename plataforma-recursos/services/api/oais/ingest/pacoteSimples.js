const crypto = require('crypto')
const path = require('path')

const { validateMetadataResource } = require('../../lib/metadataValidator')
const { criarZip } = require('../../lib/simpleZip')

function limparTexto(valor) {
	return String(valor || '').trim()
}

function normalizarHashtags(valor) {
	return limparTexto(valor)
		.split(',')
		.map((hashtag) => hashtag.trim())
		.filter(Boolean)
}

function calcularSha256(conteudo) {
	return crypto.createHash('sha256').update(conteudo).digest('hex')
}

function criarNomeSeguro(nomeOriginal, indice, usados) {
	const baseOriginal = path.basename(limparTexto(nomeOriginal) || `ficheiro-${indice + 1}`)
	const limpo = baseOriginal
		.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
		.replace(/\s+/g, ' ')
		.trim()
	const nomeBase = limpo || `ficheiro-${indice + 1}`
	const extensao = path.extname(nomeBase)
	const raiz = extensao ? nomeBase.slice(0, -extensao.length) : nomeBase

	let candidato = nomeBase
	let contador = 2
	while (usados.has(candidato.toLowerCase())) {
		candidato = `${raiz || 'ficheiro'}-${contador}${extensao}`
		contador += 1
	}
	usados.add(candidato.toLowerCase())
	return candidato
}

function construirMetadados(body, ficheiros) {
	const titulo = limparTexto(body.titulo)
	const tipo = limparTexto(body.tipo)
	const visibilidade = body.visibilidade === 'privado' ? 'privado' : 'publico'
	const ano = limparTexto(body.ano)

	const recurso = {
		tipo,
		titulo,
		visibilidade,
		dataRegisto: new Date().toISOString(),
	}

	const subtitulo = limparTexto(body.subtitulo)
	const descricao = limparTexto(body.descricao)
	const tema = limparTexto(body.tema)
	const dataCriacao = limparTexto(body.dataCriacao)
	const hashtags = normalizarHashtags(body.hashtags)

	if (subtitulo) recurso.subtitulo = subtitulo
	if (descricao) recurso.descricao = descricao
	if (tema) recurso.tema = tema
	if (dataCriacao) recurso.dataCriacao = dataCriacao
	if (ano) recurso.ano = Number(ano)
	if (hashtags.length) recurso.hashtags = hashtags

	return {
		resource: recurso,
		submissao: {
			modo: 'simples',
			geradoEm: new Date().toISOString(),
			ficheiros: ficheiros.map((ficheiro) => ({
				nomeOriginal: ficheiro.originalname,
				nomeNoPacote: ficheiro.nomeNoPacote,
				mimeType: ficheiro.mimetype || 'application/octet-stream',
				tamanho: ficheiro.size,
				sha256: calcularSha256(ficheiro.buffer),
			})),
		},
	}
}

/**
 * Valida a submissão simples usando o validador central de metadados.
 * Inclui também validação dos ficheiros.
 */
function validarSubmissaoSimples(body, ficheiros) {
	const erros = []

	// Validar ficheiros primeiro (independente dos metadados)
	if (!Array.isArray(ficheiros) || ficheiros.length === 0) {
		erros.push({ code: 'FICHEIROS_EM_FALTA', message: 'Submete pelo menos um ficheiro do recurso.' })
	}

	// Construir o objecto resource para validar com o validador central
	const resourceParaValidar = {
		tipo: limparTexto(body.tipo) || undefined,
		titulo: limparTexto(body.titulo) || undefined,
		visibilidade: body.visibilidade,
		subtitulo: limparTexto(body.subtitulo) || undefined,
		descricao: limparTexto(body.descricao) || undefined,
		tema: limparTexto(body.tema) || undefined,
		ano: limparTexto(body.ano) || undefined,
		dataCriacao: limparTexto(body.dataCriacao) || undefined,
		hashtags: body.hashtags
			? normalizarHashtags(body.hashtags)
			: undefined,
	}

	// Remover campos undefined para não confundir o validador
	Object.keys(resourceParaValidar).forEach((key) => {
		if (resourceParaValidar[key] === undefined) {
			delete resourceParaValidar[key]
		}
	})

	const validacao = validateMetadataResource(resourceParaValidar)
	if (!validacao.ok) {
		erros.push(...validacao.errors)
	}

	return erros
}

async function construirSipSimples({ body, ficheiros }) {
	const erros = validarSubmissaoSimples(body || {}, ficheiros || [])
	if (erros.length) return { ok: false, errors: erros }

	const nomesUsados = new Set()
	const ficheirosNormalizados = ficheiros.map((ficheiro, indice) => ({
		...ficheiro,
		nomeNoPacote: criarNomeSeguro(ficheiro.originalname, indice, nomesUsados),
	}))

	const metadados = construirMetadados(body || {}, ficheirosNormalizados)
	const manifestJson = {
		...metadados.resource,
		files: ficheirosNormalizados.map((ficheiro) => ({
			name: `ficheiros/${ficheiro.nomeNoPacote}`,
			size: ficheiro.size,
			type: ficheiro.mimetype || 'application/octet-stream',
			required: true,
		})),
	}
	const manifestBuffer = Buffer.from(`${JSON.stringify(manifestJson, null, 2)}\n`, 'utf8')
	const ficheirosDoPacote = ficheirosNormalizados.map((ficheiro) => ({
		caminho: `data/ficheiros/${ficheiro.nomeNoPacote}`,
		conteudo: ficheiro.buffer,
	}))

	const manifesto = ficheirosDoPacote
		.map((ficheiro) => `${calcularSha256(ficheiro.conteudo)}  ${ficheiro.caminho}`)
		.join('\n')
	const manifestoBuffer = Buffer.from(`${manifesto}\n`, 'utf8')
	const bagitBuffer = Buffer.from('BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n', 'utf8')

	const zipBuffer = await criarZip([
		{ caminho: 'bagit.txt', conteudo: bagitBuffer },
		{ caminho: 'manifest.json', conteudo: manifestBuffer },
		{ caminho: 'checksums.txt', conteudo: manifestoBuffer },
		...ficheirosDoPacote,
	])

	return {
		ok: true,
		zipBuffer,
		nomeOriginal: `${criarNomeSeguro(metadados.resource.titulo, 0, new Set())}.zip`,
		metadados,
	}
}

module.exports = {
	construirSipSimples,
}
