const UserService = require('../services/userService')
const User = require('../models/User')
const { jsonError } = require('../lib/http')
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
		res.json({ ok: true, token: dados.token, refreshToken, user: dados.user })
	} catch (err) {
		const msg = String(err?.message || '').toLowerCase()
		if (msg.includes('desativada')) {
			return jsonError(res, 403, { code: 'ACCOUNT_DISABLED', message: 'conta desativada' })
		}
		if (msg.includes('nao encontrado') || msg.includes('incorreta') || msg.includes('invalidas')) {
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
	res.json({ ok: true })
}
