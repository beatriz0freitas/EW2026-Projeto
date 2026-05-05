const { config } = require('../lib/config')

async function parseResponseBody(response) {
	const text = await response.text()
	if (!text) return null

	try {
		return JSON.parse(text)
	} catch {
		return { raw: text }
	}
}

async function requestAuthTransfer(path, options = {}) {
	const response = await fetch(`${config.auth.url}${path}`, {
		...options,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'X-Internal-Token': config.internal.serviceToken,
			...(options.headers || {}),
		},
	})

	const body = await parseResponseBody(response)
	if (!response.ok) {
		const code = body?.code || body?.error?.code || 'AUTH_TRANSFER_FAILED'
		const message = body?.message || body?.error?.message || `auth respondeu com status ${response.status}`
		const err = new Error(message)
		err.code = code
		err.status = response.status
		err.body = body
		throw err
	}

	return body
}

async function exportUsersForTransfer() {
	const body = await requestAuthTransfer('/internal/transfer/users')
	return Array.isArray(body?.users) ? body.users : []
}

async function importUsersForTransfer(users) {
	const body = await requestAuthTransfer('/internal/transfer/users', {
		method: 'POST',
		body: JSON.stringify({ users: Array.isArray(users) ? users : [] }),
	})

	return body?.results || { upserted: 0, errors: [] }
}

module.exports = {
	exportUsersForTransfer,
	importUsersForTransfer,
}
