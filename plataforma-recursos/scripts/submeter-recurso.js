#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const { Blob } = require('buffer')

const { criarZipSemCompressao } = require('../services/api/oais/ingest/pacoteSimples')

function mostrarUso() {
	console.log('Uso: node scripts/submeter-recurso.js <pasta-recurso> [ficheiro-saida.zip]')
	console.log('')
	console.log('Estrutura esperada:')
	console.log('  <pasta-recurso>/metadados.json')
	console.log('  <pasta-recurso>/ficheiros/<conteudo do recurso>')
	console.log('')
	console.log('Para enviar diretamente para a API:')
	console.log('  API_TOKEN=<token-produtor> API_URL=http://localhost:16025/api node scripts/submeter-recurso.js recursos/meu-recurso')
}

function calcularSha256(conteudo) {
	return crypto.createHash('sha256').update(conteudo).digest('hex')
}

function limparTexto(valor) {
	return String(valor || '').trim()
}

function normalizarCaminhoRelativo(caminho) {
	const normalizado = caminho.split(path.sep).join('/')
	if (!normalizado || normalizado.startsWith('../') || normalizado.includes('/../')) {
		throw new Error(`caminho inseguro: ${caminho}`)
	}
	return normalizado
}

async function listarFicheirosRecursivamente(diretoria) {
	const ficheiros = []
	const entradas = await fs.readdir(diretoria, { withFileTypes: true })

	for (const entrada of entradas) {
		const caminho = path.join(diretoria, entrada.name)
		if (entrada.isDirectory()) {
			ficheiros.push(...await listarFicheirosRecursivamente(caminho))
		} else if (entrada.isFile()) {
			ficheiros.push(caminho)
		}
	}

	return ficheiros
}

async function lerJson(caminho) {
	try {
		return JSON.parse(await fs.readFile(caminho, 'utf8'))
	} catch (erro) {
		throw new Error(`não foi possível ler JSON em ${caminho}: ${erro.message}`)
	}
}

function construirMetadados(metadadosOriginais, ficheiros) {
	const resource = metadadosOriginais.resource && typeof metadadosOriginais.resource === 'object'
		? metadadosOriginais.resource
		: metadadosOriginais

	if (!limparTexto(resource.tipo)) throw new Error('metadados.resource.tipo é obrigatório')
	if (!limparTexto(resource.titulo)) throw new Error('metadados.resource.titulo é obrigatório')
	if (!['publico', 'privado'].includes(resource.visibilidade)) {
		throw new Error('metadados.resource.visibilidade deve ser publico ou privado')
	}

	return {
		...metadadosOriginais,
		resource: {
			...resource,
			tipo: limparTexto(resource.tipo),
			titulo: limparTexto(resource.titulo),
			visibilidade: resource.visibilidade,
			dataRegisto: resource.dataRegisto || new Date().toISOString(),
		},
		submissao: {
			...(metadadosOriginais.submissao || {}),
			modo: 'pasta-local',
			geradoEm: new Date().toISOString(),
			ficheiros,
		},
	}
}

async function construirSipAPartirDePasta(pastaRecurso) {
	const caminhoMetadados = path.join(pastaRecurso, 'metadados.json')
	const pastaFicheiros = path.join(pastaRecurso, 'ficheiros')
	const metadadosOriginais = await lerJson(caminhoMetadados)
	const caminhosAbsolutos = await listarFicheirosRecursivamente(pastaFicheiros)

	if (!caminhosAbsolutos.length) {
		throw new Error('a pasta ficheiros/ deve conter pelo menos um ficheiro')
	}

	const ficheirosDoRecurso = []
	for (const caminhoAbsoluto of caminhosAbsolutos) {
		const relativo = normalizarCaminhoRelativo(path.relative(pastaFicheiros, caminhoAbsoluto))
		const conteudo = await fs.readFile(caminhoAbsoluto)
		ficheirosDoRecurso.push({
			caminho: `data/ficheiros/${relativo}`,
			conteudo,
			relatorio: {
				nomeOriginal: relativo,
				nomeNoPacote: relativo,
				tamanho: conteudo.length,
				sha256: calcularSha256(conteudo),
			},
		})
	}

	const metadados = construirMetadados(
		metadadosOriginais,
		ficheirosDoRecurso.map((ficheiro) => ficheiro.relatorio)
	)
	const conteudoMetadados = Buffer.from(`${JSON.stringify(metadados, null, 2)}\n`, 'utf8')
	const entradasPayload = [
		...ficheirosDoRecurso.map((ficheiro) => ({
			caminho: ficheiro.caminho,
			conteudo: ficheiro.conteudo,
		})),
		{ caminho: 'data/metadata.json', conteudo: conteudoMetadados },
	]
	const manifesto = entradasPayload
		.map((entrada) => `${calcularSha256(entrada.conteudo)}  ${entrada.caminho}`)
		.join('\n')

	const zipBuffer = criarZipSemCompressao([
		{
			caminho: 'bagit.txt',
			conteudo: Buffer.from('BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n', 'utf8'),
		},
		{
			caminho: 'manifest-sha256.txt',
			conteudo: Buffer.from(`${manifesto}\n`, 'utf8'),
		},
		...entradasPayload,
	])

	return {
		zipBuffer,
		metadados,
		totalFicheiros: ficheirosDoRecurso.length,
	}
}

async function escreverRelatorio(relatorio) {
	const pastaRelatorios = path.resolve('output/reports')
	await fs.mkdir(pastaRelatorios, { recursive: true })
	await fs.writeFile(
		path.join(pastaRelatorios, 'report.json'),
		`${JSON.stringify(relatorio, null, 2)}\n`
	)
}

async function enviarParaApi({ zipBuffer, nomeFicheiro, token }) {
	const apiUrl = (process.env.API_URL || 'http://localhost:16025/api').replace(/\/$/, '')
	const form = new FormData()
	form.append('sip', new Blob([zipBuffer], { type: 'application/zip' }), nomeFicheiro)

	const resposta = await fetch(`${apiUrl}/oais/ingest`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
		},
		body: form,
	})

	let payload = null
	try {
		payload = await resposta.json()
	} catch {
		payload = null
	}

	return {
		ok: resposta.ok,
		status: resposta.status,
		payload,
	}
}

async function main() {
	const pastaRecurso = process.argv[2]
	if (!pastaRecurso) {
		mostrarUso()
		process.exit(1)
	}

	const pastaAbsoluta = path.resolve(pastaRecurso)
	const nomeBase = path.basename(pastaAbsoluta)
	const saida = process.argv[3]
		? path.resolve(process.argv[3])
		: path.resolve('output/sips', `${nomeBase}.zip`)

	const resultado = await construirSipAPartirDePasta(pastaAbsoluta)
	await fs.mkdir(path.dirname(saida), { recursive: true })
	await fs.writeFile(saida, resultado.zipBuffer)

	const relatorio = {
		ok: true,
		pasta: pastaAbsoluta,
		sip: saida,
		totalFicheiros: resultado.totalFicheiros,
		titulo: resultado.metadados.resource.titulo,
		tipo: resultado.metadados.resource.tipo,
		enviadoParaApi: false,
	}

	const token = process.env.API_TOKEN || process.env.TOKEN
	if (token) {
		const submissao = await enviarParaApi({
			zipBuffer: resultado.zipBuffer,
			nomeFicheiro: path.basename(saida),
			token,
		})
		relatorio.enviadoParaApi = true
		relatorio.api = submissao

		if (!submissao.ok) {
			relatorio.ok = false
			await escreverRelatorio(relatorio)
			console.error(`Falha ao submeter na API: HTTP ${submissao.status}`)
			process.exit(1)
		}
	}

	await escreverRelatorio(relatorio)
	console.log(JSON.stringify(relatorio, null, 2))
}

main().catch(async (erro) => {
	const relatorio = {
		ok: false,
		erro: erro.message,
	}
	await escreverRelatorio(relatorio).catch(() => {})
	console.error(erro.message)
	process.exit(1)
})
