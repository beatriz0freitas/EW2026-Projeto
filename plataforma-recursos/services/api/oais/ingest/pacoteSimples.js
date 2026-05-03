const crypto = require('crypto')
const path = require('path')

const { validateMetadataResource } = require('../../lib/metadataValidator')

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

function criarTabelaCrc32() {
	const tabela = []
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) {
			c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
		}
		tabela[n] = c >>> 0
	}
	return tabela
}

const TABELA_CRC32 = criarTabelaCrc32()

function calcularCrc32(conteudo) {
	let crc = 0xffffffff
	for (const byte of conteudo) {
		crc = TABELA_CRC32[(crc ^ byte) & 0xff] ^ (crc >>> 8)
	}
	return (crc ^ 0xffffffff) >>> 0
}

function obterDataDos(data = new Date()) {
	const ano = Math.max(1980, data.getFullYear())
	const mes = data.getMonth() + 1
	const dia = data.getDate()
	const horas = data.getHours()
	const minutos = data.getMinutes()
	const segundos = Math.floor(data.getSeconds() / 2)

	return {
		hora: (horas << 11) | (minutos << 5) | segundos,
		data: ((ano - 1980) << 9) | (mes << 5) | dia,
	}
}

function criarZipSemCompressao(entradas) {
	const partesLocais = []
	const partesCentrais = []
	const dataDos = obterDataDos()
	let deslocamento = 0

	for (const entrada of entradas) {
		const nome = Buffer.from(entrada.caminho, 'utf8')
		const conteudo = Buffer.isBuffer(entrada.conteudo)
			? entrada.conteudo
			: Buffer.from(String(entrada.conteudo || ''), 'utf8')
		const crc32 = calcularCrc32(conteudo)
		const tamanho = conteudo.length

		if (tamanho > 0xffffffff || deslocamento > 0xffffffff) {
			throw new Error('ficheiro demasiado grande para o ZIP simples')
		}

		const cabecalhoLocal = Buffer.alloc(30)
		cabecalhoLocal.writeUInt32LE(0x04034b50, 0)
		cabecalhoLocal.writeUInt16LE(20, 4)
		cabecalhoLocal.writeUInt16LE(0x0800, 6)
		cabecalhoLocal.writeUInt16LE(0, 8)
		cabecalhoLocal.writeUInt16LE(dataDos.hora, 10)
		cabecalhoLocal.writeUInt16LE(dataDos.data, 12)
		cabecalhoLocal.writeUInt32LE(crc32, 14)
		cabecalhoLocal.writeUInt32LE(tamanho, 18)
		cabecalhoLocal.writeUInt32LE(tamanho, 22)
		cabecalhoLocal.writeUInt16LE(nome.length, 26)
		cabecalhoLocal.writeUInt16LE(0, 28)

		partesLocais.push(cabecalhoLocal, nome, conteudo)

		const cabecalhoCentral = Buffer.alloc(46)
		cabecalhoCentral.writeUInt32LE(0x02014b50, 0)
		cabecalhoCentral.writeUInt16LE(20, 4)
		cabecalhoCentral.writeUInt16LE(20, 6)
		cabecalhoCentral.writeUInt16LE(0x0800, 8)
		cabecalhoCentral.writeUInt16LE(0, 10)
		cabecalhoCentral.writeUInt16LE(dataDos.hora, 12)
		cabecalhoCentral.writeUInt16LE(dataDos.data, 14)
		cabecalhoCentral.writeUInt32LE(crc32, 16)
		cabecalhoCentral.writeUInt32LE(tamanho, 20)
		cabecalhoCentral.writeUInt32LE(tamanho, 24)
		cabecalhoCentral.writeUInt16LE(nome.length, 28)
		cabecalhoCentral.writeUInt16LE(0, 30)
		cabecalhoCentral.writeUInt16LE(0, 32)
		cabecalhoCentral.writeUInt16LE(0, 34)
		cabecalhoCentral.writeUInt16LE(0, 36)
		cabecalhoCentral.writeUInt32LE(0, 38)
		cabecalhoCentral.writeUInt32LE(deslocamento, 42)

		partesCentrais.push(cabecalhoCentral, nome)
		deslocamento += cabecalhoLocal.length + nome.length + conteudo.length
	}

	const diretorioCentral = Buffer.concat(partesCentrais)
	const fim = Buffer.alloc(22)
	fim.writeUInt32LE(0x06054b50, 0)
	fim.writeUInt16LE(0, 4)
	fim.writeUInt16LE(0, 6)
	fim.writeUInt16LE(entradas.length, 8)
	fim.writeUInt16LE(entradas.length, 10)
	fim.writeUInt32LE(diretorioCentral.length, 12)
	fim.writeUInt32LE(deslocamento, 16)
	fim.writeUInt16LE(0, 20)

	return Buffer.concat([...partesLocais, diretorioCentral, fim])
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
	const visibilidade = body.visibilidade === 'publico' ? 'publico' : 'privado'
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
	const metadadosBuffer = Buffer.from(`${JSON.stringify(metadados, null, 2)}\n`, 'utf8')
	const ficheirosDoPacote = ficheirosNormalizados.map((ficheiro) => ({
		caminho: `data/ficheiros/${ficheiro.nomeNoPacote}`,
		conteudo: ficheiro.buffer,
	}))
	ficheirosDoPacote.push({ caminho: 'data/metadata.json', conteudo: metadadosBuffer })

	const manifesto = ficheirosDoPacote
		.map((ficheiro) => `${calcularSha256(ficheiro.conteudo)}  ${ficheiro.caminho}`)
		.join('\n')
	const manifestoBuffer = Buffer.from(`${manifesto}\n`, 'utf8')
	const bagitBuffer = Buffer.from('BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n', 'utf8')

	const zipBuffer = criarZipSemCompressao([
		{ caminho: 'bagit.txt', conteudo: bagitBuffer },
		{ caminho: 'manifest-sha256.txt', conteudo: manifestoBuffer },
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
	criarZipSemCompressao,
}
