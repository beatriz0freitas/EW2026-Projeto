const path = require('path')
const fsp = require('fs/promises')

function buildResourceAipPath(aipDir, resourceId) {
	return path.resolve(path.join(aipDir, String(resourceId)))
}

function resolveResourceAipPath(resource, aipDir) {
	const storedPath = typeof resource?.aipPath === 'string' ? resource.aipPath.trim() : ''
	if (storedPath) return path.resolve(storedPath)
	return buildResourceAipPath(aipDir, resource?._id)
}

function buildSipZipPath(resourceAipPath) {
	return path.join(resourceAipPath, 'sip.zip')
}

function buildStoredAipFile({ resourceAipPath, originalName, mimeType, size }) {
	const zipPath = buildSipZipPath(resourceAipPath)
	return {
		originalName: originalName || 'sip.zip',
		storageName: path.basename(zipPath),
		path: zipPath,
		mimeType: mimeType || 'application/zip',
		size: Number(size) || 0,
	}
}

function assertSafeRelativePath(relativePath) {
	const normalized = path.normalize(relativePath)
	if (!relativePath || normalized.startsWith('..') || path.isAbsolute(normalized)) {
		throw new Error(`invalid AIP relative path: ${relativePath}`)
	}
	return normalized
}

async function listFilesRecursively(rootDir) {
	const files = []

	async function walk(currentDir) {
		const entries = await fsp.readdir(currentDir, { withFileTypes: true })
		for (const entry of entries) {
			const absolutePath = path.join(currentDir, entry.name)
			if (entry.isDirectory()) {
				await walk(absolutePath)
				continue
			}
			if (entry.isFile()) {
				files.push(absolutePath)
			}
		}
	}

	await walk(rootDir)
	return files
}

async function exportAipFiles(resource, aipDir) {
	const resourceAipPath = resolveResourceAipPath(resource, aipDir)
	const absolutePaths = await listFilesRecursively(resourceAipPath)
	const files = await Promise.all(
		absolutePaths.map(async (absolutePath) => {
			const relativePath = path.relative(resourceAipPath, absolutePath).split(path.sep).join('/')
			const content = await fsp.readFile(absolutePath)
			return {
				path: relativePath,
				contentBase64: content.toString('base64'),
			}
		})
	)

	return {
		resourceId: String(resource._id),
		aipPath: resourceAipPath,
		files,
	}
}

async function restoreAipFiles({ aipDir, resourceId, files }) {
	const resourceAipPath = buildResourceAipPath(aipDir, resourceId)

	await fsp.rm(resourceAipPath, { recursive: true, force: true })
	await fsp.mkdir(resourceAipPath, { recursive: true })

	for (const file of files || []) {
		const safeRelativePath = assertSafeRelativePath(file.path)
		if (typeof file.contentBase64 !== 'string') {
			throw new Error(`missing content for AIP file: ${file.path}`)
		}
		const targetPath = path.join(resourceAipPath, safeRelativePath)
		await fsp.mkdir(path.dirname(targetPath), { recursive: true })
		await fsp.writeFile(targetPath, Buffer.from(file.contentBase64, 'base64'))
	}

	return resourceAipPath
}

function resolveStoredZipPath(resource, aipDir) {
	const storedFilePath = typeof resource?.aipFile?.path === 'string' ? resource.aipFile.path.trim() : ''
	if (storedFilePath) return path.resolve(storedFilePath)
	return buildSipZipPath(resolveResourceAipPath(resource, aipDir))
}

module.exports = {
	assertSafeRelativePath,
	buildResourceAipPath,
	buildStoredAipFile,
	buildSipZipPath,
	exportAipFiles,
	resolveResourceAipPath,
	resolveStoredZipPath,
	restoreAipFiles,
}
