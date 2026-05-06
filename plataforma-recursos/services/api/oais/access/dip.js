const { lerEntradasAip } = require('../aipStorage')
const { criarZip } = require('../../lib/simpleZip')

async function construirDipZip({ resource, aipDir }) {
	let entradas
	try {
		entradas = await lerEntradasAip(resource, aipDir)
	} catch {
		return null
	}

	return {
		buffer: await criarZip(entradas),
		filename: `DIP-${resource._id}.zip`,
	}
}

module.exports = { construirDipZip }
