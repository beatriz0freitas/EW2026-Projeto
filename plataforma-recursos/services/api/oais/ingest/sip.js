const crypto = require('crypto')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')

const unzipper = require('unzipper')

const Aip = require('../../models/Aip')
const Resource = require('../../models/Resource')
const { construirCaminhoAipRecurso, construirFicheiroAipGuardado } = require('../aipStorage')
const { validateMetadata } = require('../../lib/metadataValidator')

const EXTENSOES_PERMITIDAS = new Set([
	'',
	'.pdf',
	'.txt',
	'.docx',
	'.xlsx',
	'.xls',
	'.csv',
	'.json',
	'.xml',
	'.md',
	'.ipynb',
	'.py',
	'.js',
	'.ts',
	'.java',
	'.hs',
	'.cpp',
	'.c',
	'.hpp',
	'.h',
	'.css',
	'.html',
	'.yml',
	'.yaml',
	'.ini',
	'.toml',
	'.sql',
	'.vpp',
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.svg',
	'.webp',
	'.mp4',
	'.mov',
	'.mp3',
	'.wav',
	'.zip',
	'.rar',
	'.7z',
])
const MAX_FICHEIRO_BYTES = 50 * 1024 * 1024
const CAMADAS = ['estrutura', 'metadados', 'seguranca', 'consistencia']
const FICHEIROS_RAIZ_PERMITIDOS = new Set(['manifest.json', 'bagit.txt', 'checksums.txt'])

function criarRelatorioBase({ producerId, sipHash }) {
	return {
		dataValidacao: new Date().toISOString(),
		produtor: producerId || null,
		sipHash,
		erros: [],
		avisos: [],
	}
}

function criarValidacoes() {
	return Object.fromEntries(CAMADAS.map((camada) => [camada, { ok: true, detalhes: '' }]))
}

function adicionarErro(ctx, camada, code, message) {
	ctx.errors.push({ code, message, camada })
	ctx.validacoes[camada].ok = false
	ctx.relatorio.erros.push(message)
}

function adicionarAviso(ctx, camada, code, message) {
	ctx.warnings.push({ code, message, camada })
	ctx.relatorio.avisos.push(message)
}

function finalizarValidacoes(ctx) {
	for (const camada of CAMADAS) {
		const erros = ctx.errors.filter((erro) => erro.camada === camada).map((erro) => erro.message)
		const avisos = ctx.warnings.filter((aviso) => aviso.camada === camada).map((aviso) => aviso.message)
		ctx.validacoes[camada].detalhes = [...erros, ...avisos].join(' ')
	}
}

function sha256Buffer(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex')
}

function sha256File(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256')
		const stream = fs.createReadStream(filePath)
		stream.on('error', reject)
		stream.on('data', (chunk) => hash.update(chunk))
		stream.on('end', () => resolve(hash.digest('hex')))
	})
}

async function garantirDiretoria(caminhoDiretoria) {
	await fsp.mkdir(caminhoDiretoria, { recursive: true })
}

async function copiarDiretoria(origem, destino) {
	await fsp.cp(origem, destino, { recursive: true })
}

function normalizarCaminhoZip(rawPath) {
	const normalized = path.posix.normalize(String(rawPath || '').replace(/\\/g, '/'))
	if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
		return null
	}
	return normalized
}

function caminhoDataRelativo(fileName) {
	const safeName = normalizarCaminhoZip(fileName)
	if (!safeName) return null
	return safeName.startsWith('data/') ? safeName : `data/${safeName}`
}

function nomePerigoso(nome) {
	return /[<>:"|?*\x00-\x1f]/.test(nome)
}


function lerTextoChecksums(texto) {
	const entradas = new Map()
	for (const linhaBruta of String(texto || '').split(/\r?\n/)) {
		const linha = linhaBruta.trim()
		if (!linha || linha.startsWith('#')) continue
		const primeiroEspaco = linha.indexOf(' ')
		if (primeiroEspaco === -1) continue
		const checksum = linha.slice(0, primeiroEspaco).trim()
		const caminhoFicheiro = normalizarCaminhoZip(linha.slice(primeiroEspaco).trim())
		if (checksum && caminhoFicheiro) entradas.set(caminhoFicheiro, checksum)
	}
	return entradas
}

function construirRespostaErro(ctx) {
	return {
		ok: false,
		status: 'erro',
		categoria: categoriaPrincipal(ctx.errors),
		errors: ctx.errors,
		validacoes: ctx.validacoes,
		relatorio: ctx.relatorio,
	}
}

function normalizarManifesto(parsed) {
	const manifest = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
		? parsed
		: {}
	const { files = [], ...resource } = manifest
	if (!resource.visibilidade) resource.visibilidade = 'publico'

	return {
		metadata: {
			resource,
			submissao: {
				modo: 'sip',
				manifesto: 'manifest.json',
				geradoEm: new Date().toISOString(),
				ficheiros: files.map((file) => ({
					nomeOriginal: file?.name || '',
					nomeNoPacote: file?.name || '',
					mimeType: file?.type || 'application/octet-stream',
					tamanho: file?.size || null,
					required: file?.required !== false,
				})),
			},
		},
		files,
		manifestoOriginal: manifest,
	}
}

async function extrairZipEmSeguranca(zipBuffer, outDir, ctx) {
	await garantirDiretoria(outDir)

	let directory
	try {
		directory = await unzipper.Open.buffer(zipBuffer)
	} catch {
		adicionarErro(ctx, 'estrutura', 'BAD_ZIP', 'ZIP inválido ou corrompido')
		return []
	}

	const extracted = []
	for (const file of directory.files) {
		const safePath = normalizarCaminhoZip(file.path)
		if (!safePath) {
			adicionarErro(ctx, 'seguranca', 'UNSAFE_PATH', `caminho inseguro no ZIP: ${file.path}`)
			continue
		}

		const target = path.join(outDir, safePath)
		const resolvedOut = path.resolve(outDir) + path.sep
		const resolvedTarget = path.resolve(target)
		if (!resolvedTarget.startsWith(resolvedOut)) {
			adicionarErro(ctx, 'seguranca', 'ZIP_SLIP', `zip-slip detetado no caminho: ${file.path}`)
			continue
		}

		if (file.type === 'Directory') {
			await garantirDiretoria(resolvedTarget)
			continue
		}

		await garantirDiretoria(path.dirname(resolvedTarget))
		await new Promise((resolve, reject) => {
			file
				.stream()
				.pipe(fs.createWriteStream(resolvedTarget))
				.on('finish', resolve)
				.on('error', reject)
		})

		const stat = await fsp.stat(resolvedTarget)
		extracted.push({ path: safePath, fullPath: resolvedTarget, size: stat.size })
	}

	return extracted
}

async function lerJson(filePath, ctx, camada, code, label) {
	try {
		return JSON.parse(await fsp.readFile(filePath, 'utf8'))
	} catch (err) {
		adicionarErro(ctx, camada, code, `${label} inválido: ${err.message}`)
		return null
	}
}

async function guardarAipErro({ ctx, producerId, sipId, sipHash, manifest }) {
	finalizarValidacoes(ctx)
	try {
		await Aip.create({
			sipId,
			status: 'erro',
			produtor: producerId || null,
			manifesto: manifest || null,
			validacoes: ctx.validacoes,
			relatorio: ctx.relatorio,
			checksumSIP: sipHash,
		})
	} catch (err) {
		console.error('[api][ingest] warning: failed to save AIP error trace:', err)
	}
}

function categoriaPrincipal(errors) {
	return errors.find((erro) => erro.camada)?.camada || 'estrutura'
}

async function ingerirSipZip({ zipBuffer, aipDir, producerId, uploadedFile }) {
	const sipHash = sha256Buffer(zipBuffer)
	const sipId = `SIP-${new Date().getFullYear()}-${Date.now()}`
	const ctx = {
		errors: [],
		warnings: [],
		validacoes: criarValidacoes(),
		relatorio: criarRelatorioBase({ producerId, sipHash }),
	}
	let manifestOriginal = null

	if (zipBuffer.length > 100 * 1024 * 1024) {
		adicionarErro(ctx, 'seguranca', 'SIP_TOO_LARGE', 'tamanho total do ZIP excede 100MB')
	}

	const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'ew2026-sip-'))
	const extractDir = path.join(tmpRoot, 'bag')

	try {
		const extracted = await extrairZipEmSeguranca(zipBuffer, extractDir, ctx)
		const extractedByPath = new Map(extracted.map((file) => [file.path, file]))
		const manifestExtraido = extractedByPath.get('manifest.json')
		const checksumExtraido = extractedByPath.get('checksums.txt')
		const temPayload = extracted.some((file) => file.path.startsWith('data/'))

		if (!temPayload) {
			adicionarErro(ctx, 'estrutura', 'MISSING_DATA_DIR', 'pasta data/ em falta')
		}

		for (const file of extracted) {
			if (!file.path.startsWith('data/') && !FICHEIROS_RAIZ_PERMITIDOS.has(file.path)) {
				adicionarErro(ctx, 'estrutura', 'UNEXPECTED_ROOT_FILE', `ficheiro não permitido na raiz do SIP: ${file.path}`)
			}
		}

		let metadata
		let manifestFiles = []
		if (manifestExtraido) {
			const parsed = await lerJson(manifestExtraido.fullPath, ctx, 'estrutura', 'BAD_MANIFEST_JSON', 'manifest.json')
			if (parsed) {
				const normalized = normalizarManifesto(parsed)
				metadata = normalized.metadata
				manifestFiles = normalized.files
				manifestOriginal = normalized.manifestoOriginal
			}
		} else {
			adicionarErro(ctx, 'estrutura', 'MISSING_MANIFEST', 'manifest.json em falta')
		}

		if (metadata) {
			const validacao = validateMetadata(metadata)
			if (!validacao.ok) {
				for (const erro of validacao.errors) adicionarErro(ctx, 'metadados', erro.code, erro.message)
			}
		}

		const payloadFiles = extracted.filter((file) => file.path.startsWith('data/'))
		const declaredPaths = new Set()
		for (const entry of manifestFiles) {
			const declaredName = typeof entry === 'string' ? entry : entry?.name
			const declaredPath = caminhoDataRelativo(declaredName)
			if (!declaredPath) {
				adicionarErro(ctx, 'seguranca', 'UNSAFE_DECLARED_PATH', `ficheiro declarado com caminho inválido: ${declaredName}`)
				continue
			}
			declaredPaths.add(declaredPath)

			const basename = path.posix.basename(declaredPath)
			if (nomePerigoso(basename)) {
				adicionarErro(ctx, 'seguranca', 'BAD_FILENAME', `nome de ficheiro inválido: ${declaredName}`)
			}

			const ext = path.posix.extname(declaredPath).toLowerCase()
			if (!EXTENSOES_PERMITIDAS.has(ext)) {
				adicionarErro(ctx, 'seguranca', 'BAD_EXTENSION', `extensão não permitida em ${declaredName}`)
			}

			const realFile = extractedByPath.get(declaredPath)
			if (!realFile) {
				adicionarErro(ctx, 'estrutura', 'MISSING_PAYLOAD', `ficheiro declarado no manifesto não existe em data/: ${declaredName}`)
				continue
			}

			if (realFile.size > MAX_FICHEIRO_BYTES) {
				adicionarErro(ctx, 'seguranca', 'PAYLOAD_TOO_LARGE', `ficheiro excede 50MB: ${declaredName}`)
			}

			if (entry && typeof entry === 'object' && entry.size !== undefined && Number(entry.size) !== realFile.size) {
				adicionarErro(ctx, 'consistencia', 'SIZE_MISMATCH', `tamanho declarado não coincide para ${declaredName}`)
			}
		}

		for (const payload of payloadFiles) {
			if (!declaredPaths.has(payload.path)) {
				adicionarErro(ctx, 'consistencia', 'ORPHAN_PAYLOAD', `ficheiro em data/ não listado no manifesto: ${payload.path}`)
			}
		}

		if (checksumExtraido) {
			const checksums = lerTextoChecksums(await fsp.readFile(checksumExtraido.fullPath, 'utf8'))
			for (const [filePath, checksum] of checksums) {
				const safePath = caminhoDataRelativo(filePath)
				if (!safePath || !extractedByPath.has(safePath)) {
					adicionarErro(ctx, 'consistencia', 'CHECKSUM_TARGET_MISSING', `checksum aponta para ficheiro inexistente: ${filePath}`)
					continue
				}
				if (!/^[a-fA-F0-9]{64}$/.test(checksum)) {
					adicionarErro(ctx, 'consistencia', 'BAD_CHECKSUM', `checksum SHA-256 inválido para ${filePath}`)
					continue
				}
				const digest = await sha256File(extractedByPath.get(safePath).fullPath)
				if (digest.toLowerCase() !== checksum.toLowerCase()) {
					adicionarErro(ctx, 'consistencia', 'CHECKSUM_MISMATCH', `checksum diferente para ${filePath}`)
				}
			}
		} else {
			adicionarAviso(ctx, 'consistencia', 'CHECKSUMS_MISSING', 'checksums.txt não fornecido; validação por checksum ignorada')
		}

		if (ctx.errors.length) {
			await guardarAipErro({ ctx, producerId, sipId, sipHash, manifest: manifestOriginal })
			return construirRespostaErro(ctx)
		}

		finalizarValidacoes(ctx)
		await garantirDiretoria(aipDir)

		const resourceDoc = new Resource({
			metadata,
			aipPath: '__pending__',
			aipFile: {
				originalName: uploadedFile?.originalName || 'sip.zip',
				storageName: 'sip.zip',
				path: '__pending__',
				mimeType: uploadedFile?.mimeType || 'application/zip',
				size: Number(uploadedFile?.size) || zipBuffer.length,
			},
			produtor: producerId || null,
		})

		const resourceId = String(resourceDoc._id)
		const resourceAipDir = construirCaminhoAipRecurso(aipDir, resourceId)

		try {
			await garantirDiretoria(resourceAipDir)
			await copiarDiretoria(extractDir, path.join(resourceAipDir, 'bag'))
			await fsp.writeFile(path.join(resourceAipDir, 'sip.zip'), zipBuffer)

			resourceDoc.aipPath = resourceAipDir
			resourceDoc.aipFile = construirFicheiroAipGuardado({
				caminhoAipRecurso: resourceAipDir,
				nomeOriginal: uploadedFile?.originalName,
				mimeType: uploadedFile?.mimeType,
				tamanho: uploadedFile?.size ?? zipBuffer.length,
			})
			await resourceDoc.save()

			const aipDoc = await Aip.create({
				sipId,
				recursoId: resourceDoc._id,
				status: 'ok',
				produtor: producerId || null,
				manifesto: manifestOriginal,
				validacoes: ctx.validacoes,
				storageLocal: resourceAipDir,
				relatorio: ctx.relatorio,
				checksumSIP: sipHash,
			})

			return {
				ok: true,
				status: 'ok',
				aipId: aipDoc.sipId,
				resourceId,
				recursoId: resourceId,
				mensagem: 'SIP ingerido com sucesso',
				storageLocal: resourceAipDir,
				validacoes: ctx.validacoes,
				relatorio: ctx.relatorio,
			}
		} catch (err) {
			try {
				await Resource.deleteOne({ _id: resourceDoc._id })
			} catch (resourceCleanupErr) {
				console.error(`[api][ingest] warning: failed to rollback resource ${resourceDoc._id}:`, resourceCleanupErr)
			}
			try {
				await fsp.rm(resourceAipDir, { recursive: true, force: true })
			} catch (cleanupErr) {
				console.error(`[api][ingest] warning: failed to rollback AIP dir ${resourceAipDir}:`, cleanupErr)
			}
			throw err
		}
	} catch (err) {
		adicionarErro(ctx, 'estrutura', 'INGEST_FAILED', err.message)
		await guardarAipErro({ ctx, producerId, sipId, sipHash, manifest: manifestOriginal })
		return construirRespostaErro(ctx)
	} finally {
		try {
			await fsp.rm(tmpRoot, { recursive: true, force: true })
		} catch {
			// ignore
		}
	}
}

module.exports = { ingerirSipZip }
