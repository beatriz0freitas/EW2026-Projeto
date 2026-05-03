/**
 * routes/auth.js
 *
 * No login, guarda também o refreshToken na sessão server-side a partir do
 * cookie Set-Cookie recebido do auth. Assim o interceptor de 401 em lib/http.js
 * pode renovar o access token sem pedir novo login ao utilizador.
 *
 * Requer que o serviço auth exponha POST /sessions/refresh-server que aceite
 * { refreshToken } no body (em vez de cookie) — ver nota em lib/http.js.
 */

const express = require('express')
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const FacebookStrategy = require('passport-facebook').Strategy
const { authRequest } = require('../lib/http')
const { config } = require('../lib/config')

const router = express.Router()

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

const oauthProviders = {
	google: config.oauth.google.enabled,
	facebook: config.oauth.facebook.enabled,
}

if (config.oauth.google.enabled) {
        passport.use(new GoogleStrategy({
                clientID: config.oauth.google.clientId,
                clientSecret: config.oauth.google.clientSecret,
                callbackURL: config.oauth.google.callbackUrl
        }, async (accessToken, refreshToken, profile, done) => {
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : ''
                const nome = profile.displayName || email.split('@')[0]
                done(null, { provider: 'google', providerId: profile.id, email, nome })
        }))

        router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
        
        router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/auth/login' }), async (req, res) => {
                const { provider, providerId, email, nome } = req.user
                return handleOAuthCallback(req, res, provider, providerId, email, nome)
        })
}

if (config.oauth.facebook.enabled) {
        passport.use(new FacebookStrategy({
                clientID: config.oauth.facebook.appId,
                clientSecret: config.oauth.facebook.appSecret,
                callbackURL: config.oauth.facebook.callbackUrl,
                profileFields: ['id', 'displayName', 'emails']
        }, async (accessToken, refreshToken, profile, done) => {
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@facebook.com`
                const nome = profile.displayName || 'User'
                done(null, { provider: 'facebook', providerId: profile.id, email, nome })
        }))

        router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }))

        router.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: '/auth/login' }), async (req, res) => {
                const { provider, providerId, email, nome } = req.user
                return handleOAuthCallback(req, res, provider, providerId, email, nome)
        })
}

async function handleOAuthCallback(req, res, provider, providerId, email, nome) {
        try {
                const login = await authRequest('/sessions/oauth', {
                        method: 'POST',
                        body: { provider, providerId, email, nome }
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

router.get('/login', (req, res) => {
	if (req.session.token) return res.redirect('/')
	res.render('auth/login', { title: 'Entrar', oauthProviders })
})

router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body
		const login = await authRequest('/sessions', {
			method: 'POST',
			body: { email, password },
		})

		if (!login.ok || !login.data?.token) {
			req.flashError(login.data?.message || login.data?.error || 'Não foi possível iniciar sessão.')
			return res.redirect('/auth/login')
		}

		req.session.token        = login.data.token
		req.session.user         = login.data.user
		req.session.refreshToken = extractRefreshTokenFromAuthCookies(login.headers)

		req.flashSuccess('Sessão iniciada com sucesso.')
		res.redirect('/')
	} catch {
		req.flashError('Erro inesperado ao iniciar sessão.')
		res.redirect('/auth/login')
	}
})

router.get('/register', (req, res) => {
	if (req.session.token) return res.redirect('/')
	res.render('auth/register', { title: 'Registar' })
})

router.post('/register', async (req, res) => {
	try {
		const { nome, email, password, filiacao } = req.body
		const register = await authRequest('/register', {
			method: 'POST',
			body: {
				nome,
				email,
				password,
				filiacao: filiacao ? { instituicao: filiacao } : {},
			},
		})

		if (!register.ok) {
			req.flashError(register.data?.message || register.data?.error || 'Não foi possível concluir o registo.')
			return res.redirect('/auth/register')
		}

		req.flashSuccess('Registo concluído. Agora pode entrar.')
		res.redirect('/auth/login')
	} catch {
		req.flashError('Erro inesperado no registo.')
		res.redirect('/auth/register')
	}
})

function clearSession(req, res) {
	req.session.destroy(() => {
		res.clearCookie(config.session.cookieName)
		res.redirect('/auth/login')
	})
}

router.get('/logout', clearSession)
router.post('/logout', clearSession)

module.exports = router
