const auth = require('../auth/auth')

function requireAuth(req, res, next) {
	return auth.verificaAcesso(req, res, next)
}

module.exports = {
	requireAuth,
	requireAdmin: auth.requireAdmin,
}
