const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')

const { resolveResourceAipPath } = require('../../lib/aipStorage')
const { criarZipSemCompressao } = require('../../lib/simpleZip')

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
			if (entry.isFile()) files.push(absolutePath)
		}
	}

	await walk(rootDir)
	return files
}

async function buildDipZip({ resource, aipDir }) {
	const resourceAipPath = resolveResourceAipPath(resource, aipDir)
	if (!fs.existsSync(resourceAipPath)) return null

	const absolutePaths = await listFilesRecursively(resourceAipPath)
	const entradas = await Promise.all(
		absolutePaths.map(async (absolutePath) => ({
			caminho: path.relative(resourceAipPath, absolutePath).split(path.sep).join('/'),
			conteudo: await fsp.readFile(absolutePath),
		}))
	)

	return {
		buffer: criarZipSemCompressao(entradas),
		filename: `DIP-${resource._id}.zip`,
	}
}

module.exports = { buildDipZip }
