const { lerEntradasAip } = require('../aipStorage')
const { criarZip } = require('../../lib/simpleZip')

function limparTexto(valor) {
	return String(valor || '').trim()
}

function normalizarCaminhoDip(caminho) {
	return limparTexto(caminho)
		.replace(/\\+/g, '/')
		.replace(/^data\/+/, '')
		.replace(/^\/+/, '')
}

function nomeAmigavel(caminho) {
	const partes = normalizarCaminhoDip(caminho)
		.split('/')
		.map((parte) => parte.trim())
		.filter(Boolean)
	return partes.join('/') || 'ficheiro'
}

function normalizarSelecao(selecionados) {
	if (selecionados === undefined || selecionados === null) return null
	const valores = Array.isArray(selecionados)
		? selecionados
		: selecionados
			? [selecionados]
			: []
	return new Set(
		valores
			.map(normalizarCaminhoDip)
			.filter(Boolean)
	)
}

function construirMetadadosDip(resource, ficheiros) {
	const metadata = resource?.metadata && typeof resource.metadata === 'object'
		? resource.metadata
		: {}

	return Buffer.from(`${JSON.stringify({
		tipoPacote: 'DIP',
		geradoEm: new Date().toISOString(),
		recursoId: String(resource?._id || ''),
		recurso: metadata.resource || {},
		ficheiros: ficheiros.map((ficheiro) => ({
			caminho: ficheiro.caminho,
			nome: ficheiro.nome,
			tamanho: ficheiro.conteudo.length,
		})),
	}, null, 2)}\n`, 'utf8')
}

function entradasFicheirosDip(entradasAip, selecionados) {
	const selecao = normalizarSelecao(selecionados)
	const ficheiros = []

	for (const entrada of entradasAip || []) {
		const caminhoAip = normalizarCaminhoDip(entrada?.caminho)
		if (!caminhoAip.startsWith('bag/data/')) continue

		const caminho = nomeAmigavel(caminhoAip.slice('bag/data/'.length))
		if (selecao && !selecao.has(caminho)) continue

		ficheiros.push({
			caminho,
			nome: caminho.split('/').pop() || caminho,
			conteudo: entrada.conteudo,
		})
	}

	return ficheiros.sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt'))
}

async function construirDipZip({ resource, aipDir, selecionados }) {
	let entradas
	try {
		entradas = await lerEntradasAip(resource, aipDir)
	} catch {
		return null
	}

	const ficheirosDip = entradasFicheirosDip(entradas, selecionados)
	const entradasDip = [
		{ caminho: 'metadados.json', conteudo: construirMetadadosDip(resource, ficheirosDip) },
		...ficheirosDip.map((ficheiro) => ({
			caminho: ficheiro.caminho,
			conteudo: ficheiro.conteudo,
		})),
	]

	return {
		buffer: await criarZip(entradasDip),
		filename: `DIP-${resource._id}.zip`,
	}
}

module.exports = {
	construirDipZip,
	entradasFicheirosDip,
}
