function routeAsync(handler) {
	return function (req, res, next) {
		Promise.resolve(handler(req, res, next)).catch(next)
	}
}

function requireSession(req, res, next) {
	if (req.session?.token) return next()
	req.flashError('Precisa de iniciar sessão para continuar.')
	res.redirect('/auth/login')
}

const LEVEL_RANK = {
	consumidor: 1,
	produtor: 2,
	admin: 3,
}

function requireLevel(minLevel) {
	return (req, res, next) => {
		const currentLevel = req.session?.user?.nivel
		const currentRank = LEVEL_RANK[currentLevel] || 0
		const minRank = LEVEL_RANK[minLevel] || 0

		if (currentRank >= minRank) return next()

		req.flashError('Não tem permissões para aceder a esta página.')
		res.redirect('/')
	}
}

function apiErrorMessage(responseData, fallback) {
	return responseData?.message || responseData?.error || fallback
}

module.exports = {
	routeAsync,
	requireSession,
	requireLevel,
	apiErrorMessage,
}
