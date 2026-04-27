/**
 * lib/http.js
 *
 * Camada de comunicação HTTP para os serviços auth e API.
 *
 * NOVO: interceptor de 401
 *   Se um pedido ao auth ou a API devolver 401, tenta renovar o access token chamando
 *   POST /sessions/refresh-server no auth com o refresh token guardado na sessao.
 *   Se a renovação for bem-sucedida, actualiza req.session.token e repete
 *   o pedido original uma vez. Se falhar, devolve o 401 original para que
 *   o route handler possa redirecionar para login.
 *
 * Uso:
 *   const { authRequest, apiRequest, apiFetch } = require('../lib/http')
 *   // pedidos normais — sem mudanças
 *   const res = await apiRequest('/resources', { token: req.session.token })
 *
 *   // pedidos com interceptor (passa req para poder actualizar a sessão):
 *   const res = await apiRequest('/resources', { token: req.session.token, req })
 */

const { config } = require('./config')

const AUTH_URL = config.services.authUrl
const API_URL = config.services.apiUrl

// ─── Função base ─────────────────────────────────────────────────────────────

async function requestJson(baseUrl, endpoint, { method = 'GET', token, body } = {}) {
	const headers = { Accept: 'application/json' }
	if (body !== undefined) headers['Content-Type'] = 'application/json'
	if (token) headers.Authorization = `Bearer ${token}`

	const response = await fetch(`${baseUrl}${endpoint}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	})

	let payload = null
	try { payload = await response.json() } catch { payload = null }

	return { ok: response.ok, status: response.status, data: payload }
}

async function requestRaw(baseUrl, endpoint, { method = 'GET', token, headers = {}, body } = {}) {
	const mergedHeaders = { ...headers }
	const hasAcceptHeader = Object.keys(mergedHeaders).some(
		(headerName) => headerName.toLowerCase() === 'accept'
	)

	if (!hasAcceptHeader) mergedHeaders.Accept = 'application/json'
	if (token) mergedHeaders.Authorization = `Bearer ${token}`

	return fetch(`${baseUrl}${endpoint}`, {
		method,
		headers: mergedHeaders,
		body,
	})
}

// ─── Renovação de token ───────────────────────────────────────────────────────

/**
 * Tenta chamar POST /sessions/refresh-server no auth.
 *
 * Estrategia adoptada: guardamos o refreshToken na sessao server-side
 * quando o utilizador faz login (ver routes/auth.js).
 * Se o campo nao existir, a renovacao falha graciosamente.
 */
async function tryRefresh(req) {
	const refreshToken = req?.session?.refreshToken
	if (!refreshToken) return null

	const result = await requestJson(AUTH_URL, '/sessions/refresh-server', {
		method: 'POST',
		body: { refreshToken },
	})

	if (result.ok && result.data?.token) {
		if (result.data.user) {
			req.session.user = result.data.user
			if (req.res?.locals) req.res.locals.user = result.data.user
		}
		if (result.data.refreshToken) {
			req.session.refreshToken = result.data.refreshToken
		}
		return result.data.token
	}
	return null
}

// ─── authRequest ─────────────────────────────────────────────────────────────
// Pedidos JSON ao serviço auth com renovação automática quando `req` existe.

async function requestJsonWithAutoRefresh(baseUrl, endpoint, options = {}) {
	const { req, ...rest } = options
	const result = await requestJson(baseUrl, endpoint, rest)

	if (result.status !== 401 || !req?.session) return result

	const newToken = await tryRefresh(req)
	if (!newToken) return result

	req.session.token = newToken
	return requestJson(baseUrl, endpoint, { ...rest, token: newToken })
}

function authRequest(endpoint, options = {}) {
	return requestJsonWithAutoRefresh(AUTH_URL, endpoint, options)
}

// ─── apiRequest ──────────────────────────────────────────────────────────────

function apiRequest(endpoint, options = {}) {
	return requestJsonWithAutoRefresh(API_URL, `/api${endpoint}`, options)
}

async function requestRawWithAutoRefresh(baseUrl, endpoint, options = {}) {
	const { req, ...rest } = options
	const response = await requestRaw(baseUrl, endpoint, rest)

	if (response.status !== 401 || !req?.session) return response

	const newToken = await tryRefresh(req)
	if (!newToken) return response

	req.session.token = newToken
	return requestRaw(baseUrl, endpoint, { ...rest, token: newToken })
}

function apiFetch(endpoint, options = {}) {
	return requestRawWithAutoRefresh(API_URL, `/api${endpoint}`, options)
}

module.exports = { authRequest, apiRequest, apiFetch }
