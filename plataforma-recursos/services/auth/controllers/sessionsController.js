const UserService = require('../services/userService')
const User = require('../models/User')
const { jsonError } = require('../lib/http')
const { publishUsersCountChangedNews } = require('../lib/systemNewsClient')
const { recordAuditEventAsync } = require('../lib/auditClient')
const { config } = require('../lib/config')
const {
	signAccessToken,
	signRefreshToken,
	verifyRefreshToken,
	buildAuthCookieOptions,
	buildRefreshCookieOptions,
	REFRESH_COOKIE,
} = require('../lib/jwt')

module.exports.login = async (req, res) => {
	try {
		const { email, username, password } = req.body
		const identifier = email || username

		const dados = await UserService.login(identifier, password)

		const refreshToken = signRefreshToken(dados.user)
		res.cookie(REFRESH_COOKIE, refreshToken, buildRefreshCookieOptions())

		res.cookie(config.cookies.name, dados.token, buildAuthCookieOptions())
		recordAuditEventAsync(req, {
			action: 'auth.login.success',
			actor: { id: dados.user._id, role: dados.user.role, nome: dados.user.nome },
			target: { type: 'user', id: dados.user._id },
			metadata: { identifier },
		})
		res.json({ ok: true, token: dados.token, user: dados.user })
	} catch (err) {
		const msg = String(err?.message || '').toLowerCase()
		if (msg.includes('desativada')) {
			recordAuditEventAsync(req, {
				action: 'auth.login.failed',
				status: 'failure',
				statusCode: 403,
				metadata: { identifier: req.body?.email || req.body?.username, reason: 'ACCOUNT_DISABLED' },
			})
			return jsonError(res, 403, { code: 'ACCOUNT_DISABLED', message: 'conta desativada' })
		}
		if (msg.includes('nao encontrado') || msg.includes('incorreta') || msg.includes('invalidas')) {
			recordAuditEventAsync(req, {
				action: 'auth.login.failed',
				status: 'failure',
				statusCode: 401,
				metadata: { identifier: req.body?.email || req.body?.username, reason: 'INVALID_CREDENTIALS' },
			})
			return jsonError(res, 401, { code: 'INVALID_CREDENTIALS', message: 'credenciais invalidas' })
		}
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}

module.exports.verify = (req, res) => {
	res.json({ ok: true, payload: req.user })
}

module.exports.refresh = async (req, res) => {
	const refreshToken = req.cookies?.[REFRESH_COOKIE]
	if (!refreshToken) {
		return jsonError(res, 401, { code: 'REFRESH_TOKEN_MISSING', message: 'refresh token ausente' })
	}

	let payload
	try {
		payload = verifyRefreshToken(refreshToken)
	} catch {
		return jsonError(res, 401, { code: 'REFRESH_TOKEN_INVALID', message: 'refresh token inválido ou expirado' })
	}

	const user = await User.findById(payload.sub)
	if (!user || !user.ativo) {
		return jsonError(res, 401, { code: 'ACCOUNT_DISABLED', message: 'conta inexistente ou desativada' })
	}

	const newAccessToken = signAccessToken(user)
	res.cookie(config.cookies.name, newAccessToken, buildAuthCookieOptions())

	res.json({ ok: true, token: newAccessToken, user: user.toJSON() })
}

module.exports.refreshServer = async (req, res) => {
	const refreshToken = req.body?.refreshToken

	let payload
	try {
		payload = verifyRefreshToken(refreshToken)
	} catch {
		return jsonError(res, 401, { code: 'REFRESH_TOKEN_INVALID', message: 'refresh token inválido ou expirado' })
	}

	const user = await User.findById(payload.sub)
	if (!user || !user.ativo) {
		return jsonError(res, 401, { code: 'ACCOUNT_DISABLED', message: 'conta inexistente ou desativada' })
	}

	const newAccessToken = signAccessToken(user)
	res.json({ ok: true, token: newAccessToken, user: user.toJSON() })
}

module.exports.logout = (req, res) => {
	res.clearCookie(config.cookies.name, {
		domain: config.cookies?.domain,
		path: config.cookies?.path || '/',
	})
	res.clearCookie(REFRESH_COOKIE, {
		domain: config.cookies?.domain,
		path: '/sessions/refresh',
	})
	recordAuditEventAsync(req, {
		action: 'auth.logout',
		actor: req.user ? { id: req.user.sub, role: req.user.role, nome: req.user.nome } : null,
		target: req.user ? { type: 'user', id: req.user.sub } : { type: 'session', id: null },
	})
	res.json({ ok: true })
}

module.exports.oauthLogin = async (req, res) => {
	const {provider , providerId, email, nome} = req.body;
	if (!provider || !providerId || !email || !nome) {
		return jsonError(res, 400, { code: 'MISSING_FIELDS', message: 'campos obrigatórios em falta' })
	}
	
	try {
		const dados = await UserService.oauthLogin(provider, providerId, email, nome)

		if (dados.isNew) {
			const counts = await UserService.getStats()
			publishUsersCountChangedNews(counts).catch((err) => {
				console.error('[auth] warning: could not publish users-count news via oauth:', err)
			})
		}

		const refreshToken = signRefreshToken(dados.user)
		res.cookie(REFRESH_COOKIE, refreshToken, buildRefreshCookieOptions())

		res.cookie(config.cookies.name, dados.token, buildAuthCookieOptions())
		recordAuditEventAsync(req, {
			action: dados.isNew ? 'auth.oauth.register' : 'auth.oauth.login',
			actor: { id: dados.user._id, role: dados.user.role, nome: dados.user.nome },
			target: { type: 'user', id: dados.user._id },
			metadata: { provider },
		})
		res.json({ ok: true, token: dados.token, user: dados.user })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}
