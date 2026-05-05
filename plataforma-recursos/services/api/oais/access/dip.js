const { readAipEntries } = require('../aipStorage')
const { criarZip } = require('../../lib/simpleZip')

async function buildDipZip({ resource, aipDir }) {
	let entradas
	try {
		entradas = await readAipEntries(resource, aipDir)
	} catch {
		return null
	}

	return {
		buffer: await criarZip(entradas),
		filename: `DIP-${resource._id}.zip`,
	}
}

module.exports = { buildDipZip }
