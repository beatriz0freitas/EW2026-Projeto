const path = require('path')
const fsp = require('fs/promises')

function construirCaminhoAipRecurso(pastaAip, recursoId) {
	return path.resolve(path.join(pastaAip, String(recursoId)))
}

function resolverCaminhoAipRecurso(recurso, pastaAip) {
	const caminhoGuardado = typeof recurso?.aipPath === 'string' ? recurso.aipPath.trim() : ''
	if (caminhoGuardado) return path.resolve(caminhoGuardado)
	return construirCaminhoAipRecurso(pastaAip, recurso?._id)
}

function construirCaminhoZipSip(caminhoAipRecurso) {
	return path.join(caminhoAipRecurso, 'sip.zip')
}

function construirFicheiroAipGuardado({ caminhoAipRecurso, nomeOriginal, mimeType, tamanho }) {
	const caminhoZip = construirCaminhoZipSip(caminhoAipRecurso)
	return {
		originalName: nomeOriginal || 'sip.zip',
		storageName: path.basename(caminhoZip),
		path: caminhoZip,
		mimeType: mimeType || 'application/zip',
		size: Number(tamanho) || 0,
	}
}

function validarCaminhoRelativoSeguro(caminhoRelativo) {
	const caminhoNormalizado = path.normalize(caminhoRelativo)
	if (!caminhoRelativo || caminhoNormalizado.startsWith('..') || path.isAbsolute(caminhoNormalizado)) {
		throw new Error(`caminho relativo AIP inválido: ${caminhoRelativo}`)
	}
	return caminhoNormalizado
}

async function listarFicheirosRecursivamente(pastaRaiz) {
	const ficheiros = []

	async function percorrer(pastaAtual) {
		const entradas = await fsp.readdir(pastaAtual, { withFileTypes: true })
		for (const entrada of entradas) {
			const caminhoAbsoluto = path.join(pastaAtual, entrada.name)
			if (entrada.isDirectory()) {
				await percorrer(caminhoAbsoluto)
				continue
			}
			if (entrada.isFile()) {
				ficheiros.push(caminhoAbsoluto)
			}
		}
	}

	await percorrer(pastaRaiz)
	return ficheiros
}

async function exportarFicheirosAip(recurso, pastaAip) {
	const caminhoAipRecurso = resolverCaminhoAipRecurso(recurso, pastaAip)
	const caminhosAbsolutos = await listarFicheirosRecursivamente(caminhoAipRecurso)
	const ficheiros = await Promise.all(
		caminhosAbsolutos.map(async (caminhoAbsoluto) => {
			const caminhoRelativo = path.relative(caminhoAipRecurso, caminhoAbsoluto).split(path.sep).join('/')
			const conteudo = await fsp.readFile(caminhoAbsoluto)
			return {
				path: caminhoRelativo,
				contentBase64: conteudo.toString('base64'),
			}
		})
	)

	return {
		resourceId: String(recurso._id),
		aipPath: caminhoAipRecurso,
		files: ficheiros,
	}
}

async function lerEntradasAip(recurso, pastaAip) {
	const caminhoAipRecurso = resolverCaminhoAipRecurso(recurso, pastaAip)
	const caminhosAbsolutos = await listarFicheirosRecursivamente(caminhoAipRecurso)

	return Promise.all(
		caminhosAbsolutos.map(async (caminhoAbsoluto) => ({
			caminho: path.relative(caminhoAipRecurso, caminhoAbsoluto).split(path.sep).join('/'),
			conteudo: await fsp.readFile(caminhoAbsoluto),
		}))
	)
}

async function reporFicheirosAip({ pastaAip, recursoId, files }) {
	const caminhoAipRecurso = construirCaminhoAipRecurso(pastaAip, recursoId)

	await fsp.rm(caminhoAipRecurso, { recursive: true, force: true })
	await fsp.mkdir(caminhoAipRecurso, { recursive: true })

	for (const file of files || []) {
		const caminhoRelativoSeguro = validarCaminhoRelativoSeguro(file.path)
		if (typeof file.contentBase64 !== 'string') {
			throw new Error(`conteúdo em falta para ficheiro AIP: ${file.path}`)
		}
		const caminhoDestino = path.join(caminhoAipRecurso, caminhoRelativoSeguro)
		await fsp.mkdir(path.dirname(caminhoDestino), { recursive: true })
		await fsp.writeFile(caminhoDestino, Buffer.from(file.contentBase64, 'base64'))
	}

	return caminhoAipRecurso
}

module.exports = {
	construirCaminhoAipRecurso,
	construirFicheiroAipGuardado,
	exportarFicheirosAip,
	lerEntradasAip,
	resolverCaminhoAipRecurso,
	reporFicheirosAip,
}
