const { authRequest } = require('../lib/http')
const { config } = require('../lib/config')

const providersSociais = [
	{ id: 'facebook', nome: 'Facebook', href: '/auth/facebook', ativo: config.oauth.facebook.enabled, sigla: 'f' },
	{ id: 'google', nome: 'Google', href: '/auth/google', ativo: config.oauth.google.enabled, sigla: 'G' },
]

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
	let inlineError = null
	if (req.query?.requireAuth === '1') {
		const labels = {
			home: 'Início',
			resources: 'Recursos',
			posts: 'Comunidade',
			data: 'Dados',
		}
		const targetLabel = labels[String(req.query.target || '').trim()] || 'essa área'
		inlineError = `Precisa de autenticação prévia para aceder a ${targetLabel}.`
	}
	res.render('auth/login', { title: 'Entrar', providersSociais, error: inlineError || res.locals.error })
}

async function login(req, res) {
	try {
		const { identificador, email, password } = req.body
		const loginId = String(identificador || email || '').trim()
		const loginResponse = await authRequest('/sessions', {
			method: 'POST',
			body: { email: loginId, username: loginId, password },
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
	res.render('auth/register', { title: 'Registar', providersSociais })
}

function showPasswordHelp(req, res) {
	req.flashError('A recuperação de palavra-passe ainda não está automatizada. Contacte um administrador da plataforma.')
	res.redirect('/auth/login')
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
	showPasswordHelp,
	register,
	logout,
}
