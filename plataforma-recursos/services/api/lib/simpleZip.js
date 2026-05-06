const JSZip = require('jszip')

const TAMANHO_MAXIMO_ENTRADA = 100 * 1024 * 1024

function normalizarCaminhoZip(caminho) {
	const texto = String(caminho || '').trim().replace(/\\+/g, '/')
	if (!texto) throw new Error('caminho ZIP em falta')
	if (texto.startsWith('/') || texto.startsWith('../') || texto.includes('/../') || texto === '..') {
		throw new Error(`caminho ZIP inválido: ${caminho}`)
	}

	const partes = texto
		.split('/')
		.map((parte) => parte.trim())
		.filter(Boolean)

	if (!partes.length || partes.some((parte) => parte === '.' || parte === '..')) {
		throw new Error(`caminho ZIP inválido: ${caminho}`)
	}

	return partes.join('/')
}

function normalizarConteudo(conteudo) {
	const buffer = Buffer.isBuffer(conteudo)
		? conteudo
		: Buffer.from(String(conteudo || ''), 'utf8')

	if (buffer.length > TAMANHO_MAXIMO_ENTRADA) {
		throw new Error('ficheiro demasiado grande para o ZIP simples')
	}

	return buffer
}

async function criarZip(entradas) {
	if (!Array.isArray(entradas) || !entradas.length) {
		throw new Error('é necessário indicar pelo menos uma entrada para o ZIP')
	}

	const zip = new JSZip()
	const caminhosUsados = new Set()

	for (const entrada of entradas) {
		const caminho = normalizarCaminhoZip(entrada?.caminho)
		if (caminhosUsados.has(caminho)) {
			throw new Error(`entrada ZIP duplicada: ${caminho}`)
		}
		caminhosUsados.add(caminho)

		zip.file(caminho, normalizarConteudo(entrada?.conteudo), {
			binary: true,
			compression: 'STORE',
		})
	}

	return zip.generateAsync({
		type: 'nodebuffer',
		compression: 'STORE',
		platform: 'UNIX',
		mimeType: 'application/zip',
		streamFiles: false,
	})
}

module.exports = { criarZip }
