function canViewResource(resource, user) {
	const visibilidade = resource?.metadata?.resource?.visibilidade || 'privado'
	if (visibilidade !== 'privado') return true
	if (!user) return false
	if (user.role === 'admin') return true
	return String(resource.produtor) === String(user.sub)
}

function visibilityQuery(user) {
	if (!user) return { 'metadata.resource.visibilidade': 'publico' }
	if (user.role === 'admin') return {}
	return {
		$or: [{ 'metadata.resource.visibilidade': 'publico' }, { produtor: String(user.sub) }],
	}
}

function resourceAccessError(resource, user) {
	const visibilidade = resource?.metadata?.resource?.visibilidade || 'privado'
	if (visibilidade === 'privado' && !user) {
		return {
			status: 401,
			body: { code: 'AUTH_REQUIRED', message: 'autenticação necessária para recursos privados' },
		}
	}
	return {
		status: 403,
		body: { code: 'FORBIDDEN', message: 'acesso negado' },
	}
}

function resourceSummary(resource) {
	if (!resource) return null
	return {
		_id: resource._id,
		titulo: resource.metadata?.resource?.titulo || 'recurso sem título',
		tipo: resource.metadata?.resource?.tipo || '',
		visibilidade: resource.metadata?.resource?.visibilidade || 'privado',
	}
}

module.exports = {
	canViewResource,
	visibilityQuery,
	resourceAccessError,
	resourceSummary,
}
