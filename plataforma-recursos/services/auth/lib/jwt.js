const jwt = require('jsonwebtoken')
const { config } = require('./config')

function durationToMs(expiresIn) {
	if (expiresIn === undefined || expiresIn === null) return undefined

	if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
		return Math.max(0, expiresIn * 1000)
	}

	const str = String(expiresIn).trim()
	if (!str) return undefined

	// jsonwebtoken accepts strings like '24h', '30m', '7d'
	const match = str.match(/^([0-9]+)\s*([smhd])$/i)
	if (!match) return undefined

	const value = Number(match[1])
	const unit = match[2].toLowerCase()
	const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
	return value * (multipliers[unit] || 0)
}

function signAccessToken(user) {
	const payload = {
		sub: String(user._id),
		email: user.email,
		nivel: user.nivel,
		nome: user.nome,
	}

	return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn })
}

function verifyAccessToken(token) {
	return jwt.verify(token, config.jwt.secret)
}

function getBearerToken(req) {
	const authHeader = req.headers['authorization'] || ''
	if (!authHeader.startsWith('Bearer ')) return null
	return authHeader.slice(7)
}

function getCookieToken(req) {
	const name = config.cookies.name
	return req.cookies ? req.cookies[name] : null
}

function extractAccessToken(req) {
	return getBearerToken(req) || getCookieToken(req)
}

function buildAuthCookieOptions() {
	const maxAge = durationToMs(config.jwt.expiresIn)

	return {
		httpOnly: true,
		secure: config.cookies.secure,
		sameSite: config.cookies.sameSite,
		domain: config.cookies.domain,
		path: config.cookies.path,
		maxAge,
	}
}

module.exports = {
	signAccessToken,
	verifyAccessToken,
	extractAccessToken,
	buildAuthCookieOptions,
}
