const MAX_METADATA_TEXT = 2000

function normalizeText(value) {
	const text = String(value || '').trim()
	return text.length > MAX_METADATA_TEXT ? `${text.slice(0, MAX_METADATA_TEXT)}...` : text
}

function sanitizeMetadata(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	const blocked = new Set(['password', 'token', 'refreshToken', 'authorization', 'cookie', 'dump', 'dumpText'])
	const output = {}

	for (const [key, raw] of Object.entries(value)) {
		if (blocked.has(key)) continue
		if (raw === undefined) continue
		if (raw === null || ['string', 'number', 'boolean'].includes(typeof raw)) {
			output[key] = typeof raw === 'string' ? normalizeText(raw) : raw
		} else if (Array.isArray(raw)) {
			output[key] = raw.slice(0, 20).map((item) => (
				typeof item === 'string' ? normalizeText(item) : item
			))
		} else if (typeof raw === 'object') {
			output[key] = sanitizeMetadata(raw)
		}
	}

	return output
}

module.exports = { sanitizeMetadata }
