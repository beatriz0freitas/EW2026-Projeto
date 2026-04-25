const NewsItem = require('../models/NewsItem')

function normalizeTipo(tipo) {
	return tipo === 'system' ? 'system' : 'manual'
}

function normalizeString(value) {
	if (value === undefined || value === null) return null
	const str = String(value).trim()
	return str || null
}

async function publishNews(input) {
	const titulo = normalizeString(input?.titulo)
	const conteudo = normalizeString(input?.conteudo)
	if (!titulo || !conteudo) {
		throw new Error('titulo e conteudo sao obrigatorios')
	}

	const dedupeKey = normalizeString(input?.dedupeKey)
	const doc = {
		titulo,
		conteudo,
		tipo: normalizeTipo(input?.tipo),
		eventType: normalizeString(input?.eventType),
		dedupeKey: dedupeKey || undefined,
		payload: input?.payload && typeof input.payload === 'object' ? input.payload : null,
		createdBy: normalizeString(input?.createdBy) || 'system',
		publicadoEm: input?.publicadoEm ? new Date(input.publicadoEm) : new Date(),
	}

	try {
		const item = await NewsItem.create(doc)
		return { created: true, duplicated: false, item }
	} catch (err) {
		if (dedupeKey && err?.code === 11000) {
			const item = await NewsItem.findOne({ dedupeKey })
			return { created: false, duplicated: true, item }
		}
		throw err
	}
}

module.exports = {
	publishNews,
}
