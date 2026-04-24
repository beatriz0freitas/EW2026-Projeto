/**
 * lib/http.js
 *
 * Camada de comunicação HTTP para os serviços auth e API.
 *
 * NOVO: interceptor de 401
 *   Se um pedido à API devolver 401, tenta renovar o access token chamando
 *   POST /sessions/refresh-server no auth com o refresh token guardado na sessao.
 *   Se a renovação for bem-sucedida, actualiza req.session.token e repete
 *   o pedido original uma vez. Se falhar, devolve o 401 original para que
 *   o route handler possa redirecionar para login.
 *
 * Uso:
 *   const { authRequest, apiRequest } = require('../lib/http')
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
		return result.data.token
	}
	return null
}

// ─── authRequest ─────────────────────────────────────────────────────────────
// Pedidos ao serviço auth — sem interceptor (o auth é quem emite tokens,
// não faz sentido tentar renovar contra si próprio).

function authRequest(endpoint, options = {}) {
	return requestJson(AUTH_URL, endpoint, options)
}

// ─── apiRequest ──────────────────────────────────────────────────────────────
// Pedidos ao serviço API com interceptor automático de 401.
//
// Passa `req` nas options para activar o interceptor:
//   apiRequest('/resources', { token: req.session.token, req })
//
// Se não passares `req`, o comportamento é idêntico ao original.

async function apiRequest(endpoint, options = {}) {
	const { req, ...rest } = options
	const result = await requestJson(API_URL, `/api${endpoint}`, rest)

	// Não é 401 ou não temos sessão para renovar → devolve directamente
	if (result.status !== 401 || !req?.session) return result

	// Tentar renovar o token
	const newToken = await tryRefresh(req)
	if (!newToken) return result   // renovação falhou → devolve 401 original

	// Actualizar a sessão e repetir o pedido com o novo token
	req.session.token = newToken
	return requestJson(API_URL, `/api${endpoint}`, { ...rest, token: newToken })
}

module.exports = { authRequest, apiRequest }