const { authRequest } = require('../lib/http')
const { config } = require('../lib/config')

const oauthProviders = {
	google: config.oauth.google.enabled,
	facebook: config.oauth.facebook.enabled,
}

function getSetCookieHeader(headers) {
	if (!headers) return ''
	if (typeof headers.getSetCookie === 'function') {
		return headers.getSetCookie().join(', ')
	}
	return headers.get('set-cookie') || ''
}

function extractRefreshTokenFromAuthCookies(headers) {
	const setCookie = getSetCookieHeader(headers)
	if (!setCookie) return null

	const cookieName = config.auth.refreshCookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const match = setCookie.match(new RegExp(`(?:^|,\\s*)${cookieName}=([^;]+)`))
	return match ? decodeURIComponent(match[1]) : null
}

async function handleOAuthCallback(req, res, provider, providerId, email, nome) {
	try {
		const login = await authRequest('/sessions/oauth', {
			method: 'POST',
			body: { provider, providerId, email, nome },
		})
		if (!login.ok || !login.data?.token) {
			req.flashError('Erro no login alternativo.')
			return res.redirect('/auth/login')
		}

		req.session.token = login.data.token
		req.session.user = login.data.user
		req.session.refreshToken = extractRefreshTokenFromAuthCookies(login.headers)
		req.flashSuccess('Sessão iniciada com sucesso.')
		res.redirect('/')
	} catch {
		req.flashError('Erro ao comunicar com serviço de autenticação.')
		res.redirect('/auth/login')
	}
}

function showLogin(req, res) {
	if (req.session.token) return res.redirect('/')
	res.render('auth/login', { title: 'Entrar', oauthProviders })
}

async function login(req, res) {
	try {
		const { email, password } = req.body
		const loginResponse = await authRequest('/sessions', {
			method: 'POST',
			body: { email, password },
		})

		if (!loginResponse.ok || !loginResponse.data?.token) {
			req.flashError(loginResponse.data?.message || loginResponse.data?.error || 'Não foi possível iniciar sessão.')
			return res.redirect('/auth/login')
		}

		req.session.token = loginResponse.data.token
		req.session.user = loginResponse.data.user
		req.session.refreshToken = extractRefreshTokenFromAuthCookies(loginResponse.headers)

		req.flashSuccess('Sessão iniciada com sucesso.')
		res.redirect('/')
	} catch {
		req.flashError('Erro inesperado ao iniciar sessão.')
		res.redirect('/auth/login')
	}
}

function showRegister(req, res) {
	if (req.session.token) return res.redirect('/')
	res.render('auth/register', { title: 'Registar' })
}

async function register(req, res) {
	try {
		const { nome, email, password, filiacao } = req.body
		const registerResponse = await authRequest('/register', {
			method: 'POST',
			body: {
				nome,
				email,
				password,
				filiacao: filiacao ? { instituicao: filiacao } : {},
			},
		})

		if (!registerResponse.ok) {
			req.flashError(registerResponse.data?.message || registerResponse.data?.error || 'Não foi possível concluir o registo.')
			return res.redirect('/auth/register')
		}

		req.flashSuccess('Registo concluído. Agora pode entrar.')
		res.redirect('/auth/login')
	} catch {
		req.flashError('Erro inesperado no registo.')
		res.redirect('/auth/register')
	}
}

function logout(req, res) {
	req.session.destroy(() => {
		res.clearCookie(config.session.cookieName)
		res.redirect('/auth/login')
	})
}

module.exports = {
	handleOAuthCallback,
	showLogin,
	login,
	showRegister,
	register,
	logout,
}
