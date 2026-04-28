const fs = require('fs')

const { resolveStoredZipPath } = require('../../lib/aipStorage')

async function getDipZipPath({ resource, aipDir }) {
	const zipPath = resolveStoredZipPath(resource, aipDir)
	if (!fs.existsSync(zipPath)) return null
	return zipPath
}

module.exports = { getDipZipPath }
