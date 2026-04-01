const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
	throw new Error('JWT_SECRET em falta. Define JWT_SECRET no ambiente para arrancar o serviço auth.')
}

function getBearerToken(req) {
	const authHeader = req.headers['authorization'] || ''
	if (!authHeader.startsWith('Bearer ')) return null
	return authHeader.slice(7)
}

function requireAuth(req, res, next) {
	try {
		const token = getBearerToken(req)
		if (!token) {
			return res.status(401).json({ ok: false, error: 'token ausente' })
		}

		const payload = jwt.verify(token, JWT_SECRET)
		req.user = payload
		next()
	} catch (err) {
		return res.status(401).json({ ok: false, error: 'token inválido ou expirado' })
	}
}

function requireAdmin(req, res, next) {
	if (!req.user || req.user.nivel !== 'admin') {
		return res.status(403).json({ ok: false, error: 'acesso reservado a admin' })
	}
	next()
}

module.exports = {
	requireAuth,
	requireAdmin,
}
