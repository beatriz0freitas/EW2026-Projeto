const AUTH_URL = process.env.AUTH_URL || 'http://auth:16027'
const API_URL = process.env.API_URL || 'http://api:16025'

async function requestJson(baseUrl, endpoint, { method = 'GET', token, body } = {}) {
	const headers = {
		Accept: 'application/json',
	}

	if (body !== undefined) {
		headers['Content-Type'] = 'application/json'
	}

	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	const response = await fetch(`${baseUrl}${endpoint}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	})

	let payload = null
	try {
		payload = await response.json()
	} catch (err) {
		payload = null
	}

	return {
		ok: response.ok,
		status: response.status,
		data: payload,
	}
}

function authRequest(endpoint, options) {
	return requestJson(AUTH_URL, endpoint, options)
}

function apiRequest(endpoint, options) {
	return requestJson(API_URL, `/api${endpoint}`, options)
}

module.exports = {
	authRequest,
	apiRequest,
}
