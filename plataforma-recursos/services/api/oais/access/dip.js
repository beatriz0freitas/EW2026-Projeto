const fs = require('fs')
const path = require('path')

async function getDipZipPath({ resourceId, aipDir }) {
	const zipPath = path.join(aipDir, String(resourceId), 'sip.zip')
	if (!fs.existsSync(zipPath)) return null
	return zipPath
}

module.exports = { getDipZipPath }

