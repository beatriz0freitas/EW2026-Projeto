const crypto = require('crypto')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')

const unzipper = require('unzipper')

const Resource = require('../../models/Resource')

// Calcula o SHA-256 de um ficheiro para comparar com o manifest.
function sha256File(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256')
		const stream = fs.createReadStream(filePath)
		stream.on('error', reject)
		stream.on('data', (chunk) => hash.update(chunk))
		stream.on('end', () => resolve(hash.digest('hex')))
	})
}

// Lista recursivamente todos os ficheiros dentro de uma diretoria.
async function listFilesRecursively(rootDir) {
	const files = []
	async function walk(current) {
		const entries = await fsp.readdir(current, { withFileTypes: true })
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name)
			if (entry.isDirectory()) {
				await walk(fullPath)
			} else if (entry.isFile()) {
				files.push(fullPath)
			}
		}
	}
	await walk(rootDir)
	return files
}

// Faz parse de um manifest estilo “sha256  caminho”, ignorando comentários/linhas vazias.
function parseManifest(text) {
	const lines = text.split(/\r?\n/)
	const entries = []
	for (const raw of lines) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		const firstSpace = line.indexOf(' ')
		if (firstSpace === -1) {
			entries.push({ checksum: null, filePath: null, raw: line })
			continue
		}
		const checksum = line.slice(0, firstSpace).trim()
		const filePath = line.slice(firstSpace).trim()
		entries.push({ checksum, filePath })
	}
	return entries
}

// Cria diretoria mesmo que já exista.
async function ensureDir(dirPath) {
	await fsp.mkdir(dirPath, { recursive: true })
}

// Copia recursivamente uma pasta, usado para guardar o bag no AIP.
async function copyDir(src, dst) {
	await ensureDir(dst)
	const entries = await fsp.readdir(src, { withFileTypes: true })
	for (const entry of entries) {
		const from = path.join(src, entry.name)
		const to = path.join(dst, entry.name)
		if (entry.isDirectory()) {
			await copyDir(from, to)
		} else if (entry.isFile()) {
			await ensureDir(path.dirname(to))
			await fsp.copyFile(from, to)
		}
	}
}

// Extrai ZIP para uma diretoria temporária com proteção contra zip-slip.
async function safeUnzipToDir(zipBuffer, outDir) {
	await ensureDir(outDir)
	const directory = await unzipper.Open.buffer(zipBuffer)
	for (const file of directory.files) {
		const rawPath = file.path
		if (!rawPath) continue

		const normalized = path.normalize(rawPath)
		if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
			throw new Error(`Unsafe path in zip: ${rawPath}`)
		}

		const target = path.join(outDir, normalized)
		const resolvedOut = path.resolve(outDir) + path.sep
		const resolvedTarget = path.resolve(target)
		if (!resolvedTarget.startsWith(resolvedOut)) {
			throw new Error(`Zip-slip detected for path: ${rawPath}`)
		}

		if (file.type === 'Directory') {
			await ensureDir(resolvedTarget)
			continue
		}

		await ensureDir(path.dirname(resolvedTarget))
		await new Promise((resolve, reject) => {
			file
				.stream()
				.pipe(fs.createWriteStream(resolvedTarget))
				.on('finish', resolve)
				.on('error', reject)
		})
	}
}

// Validação mínima do metadata.json (campos obrigatórios para o MVP).
function validateMetadata(metadata) {
	const errors = []
	if (!metadata || typeof metadata !== 'object') {
		errors.push({ code: 'BAD_METADATA', message: 'metadata.json must be a JSON object' })
		return errors
	}
	if (!metadata.resource || typeof metadata.resource !== 'object') {
		errors.push({ code: 'BAD_METADATA', message: 'metadata.resource is required' })
		return errors
	}

	const resource = metadata.resource
	if (!resource.tipo) errors.push({ code: 'BAD_METADATA', message: 'metadata.resource.tipo is required' })
	if (!resource.titulo) errors.push({ code: 'BAD_METADATA', message: 'metadata.resource.titulo is required' })
	if (!resource.visibilidade) errors.push({ code: 'BAD_METADATA', message: 'metadata.resource.visibilidade is required (publico|privado)' })
	return errors
}

// Ingest (SIP ZIP -> validação -> guardar AIP em disco -> registo no Mongo).
async function ingestSipZip({ zipBuffer, aipDir, producerId }) {
	const errors = []

	// 1) Extrair o SIP para uma pasta temporária.
	const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'ew2026-sip-'))
	const extractDir = path.join(tmpRoot, 'bag')

	try {
		await safeUnzipToDir(zipBuffer, extractDir)

		// 2) Verificar estrutura mínima do SIP (BagIt + manifest + data + metadata).
		const bagitPath = path.join(extractDir, 'bagit.txt')
		const manifestPath = path.join(extractDir, 'manifest-sha256.txt')
		const dataDir = path.join(extractDir, 'data')
		const metadataPath = path.join(dataDir, 'metadata.json')

		if (!fs.existsSync(bagitPath)) errors.push({ code: 'MISSING_BAGIT', message: 'Missing bagit.txt' })
		if (!fs.existsSync(manifestPath)) errors.push({ code: 'MISSING_MANIFEST', message: 'Missing manifest-sha256.txt' })
		if (!fs.existsSync(dataDir)) errors.push({ code: 'MISSING_DATA_DIR', message: 'Missing data/ directory' })
		if (!fs.existsSync(metadataPath)) errors.push({ code: 'MISSING_METADATA', message: 'Missing data/metadata.json' })

		if (errors.length) return { ok: false, errors }

		// 3) Ler e validar metadata.
		let metadata
		try {
			metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf-8'))
		} catch (err) {
			return { ok: false, errors: [{ code: 'BAD_METADATA', message: `Invalid JSON in metadata.json: ${err.message}` }] }
		}

		errors.push(...validateMetadata(metadata))
		if (errors.length) return { ok: false, errors }

		// 4) Ler manifest e verificar checksums dos ficheiros referenciados.
		const manifestText = await fsp.readFile(manifestPath, 'utf-8')
		const manifestEntries = parseManifest(manifestText)

		for (const entry of manifestEntries) {
			if (!entry.checksum || !entry.filePath) {
				errors.push({ code: 'BAD_MANIFEST', message: `Invalid manifest line: ${entry.raw || ''}` })
				continue
			}
			if (!/^[a-fA-F0-9]{64}$/.test(entry.checksum)) {
				errors.push({ code: 'BAD_MANIFEST', message: `Invalid sha256 checksum for ${entry.filePath}` })
				continue
			}
			if (!entry.filePath.startsWith('data/')) {
				errors.push({ code: 'BAD_MANIFEST', message: `Manifest path must start with data/: ${entry.filePath}` })
				continue
			}

			const fullPath = path.join(extractDir, entry.filePath)
			if (!fs.existsSync(fullPath)) {
				errors.push({ code: 'MISSING_PAYLOAD', message: `Missing file referenced in manifest: ${entry.filePath}` })
				continue
			}

			const digest = await sha256File(fullPath)
			if (digest.toLowerCase() !== entry.checksum.toLowerCase()) {
				errors.push({ code: 'CHECKSUM_MISMATCH', message: `Checksum mismatch for ${entry.filePath}` })
			}
		}

		if (errors.length) return { ok: false, errors }

		// 5) Garantir que todos os ficheiros reais em data/ aparecem no manifest.
		const dataFiles = await listFilesRecursively(dataDir)
		const manifestPaths = new Set(manifestEntries.filter(e => e.filePath).map(e => e.filePath))
		for (const filePathAbs of dataFiles) {
			const rel = path.relative(extractDir, filePathAbs).split(path.sep).join('/')
			if (!manifestPaths.has(rel)) {
				errors.push({ code: 'BAD_MANIFEST', message: `File under data/ not listed in manifest: ${rel}` })
			}
		}

		if (errors.length) return { ok: false, errors }

		// 6) Guardar AIP: pasta do recurso (com base no _id), bag extraído e o ZIP original.
		await ensureDir(aipDir)

		const resourceDoc = new Resource({
			metadata,
			aipPath: '__pending__',
			produtor: producerId || null,
		})

		const resourceId = String(resourceDoc._id)
		const resourceAipDir = path.join(aipDir, resourceId)
		await ensureDir(resourceAipDir)

		const bagDst = path.join(resourceAipDir, 'bag')
		await copyDir(extractDir, bagDst)
		await fsp.writeFile(path.join(resourceAipDir, 'sip.zip'), zipBuffer)

		resourceDoc.aipPath = resourceAipDir
		await resourceDoc.save()

		return { ok: true, resourceId }
	} catch (err) {
		return { ok: false, errors: [{ code: 'INGEST_FAILED', message: err.message }] }
	} finally {
		try {
			await fsp.rm(tmpRoot, { recursive: true, force: true })
		} catch {
			// ignore
		}
	}
}

module.exports = { ingestSipZip }