const EXPORT_ROOT_TYPES_BY_ROLE = {
	admin: ['resources', 'news', 'users', 'posts', 'comments', 'ratings'],
	produtor: ['resources', 'news', 'posts', 'comments', 'ratings'],
	consumidor: ['resources', 'news', 'posts', 'comments', 'ratings'],
}

const IMPORT_ROOT_TYPES_BY_ROLE = {
	admin: ['resources', 'news', 'users', 'posts', 'comments', 'ratings'],
	produtor: ['resources'],
	consumidor: [],
}

function normalizarRole(user) {
	const role = String(user?.role || 'consumidor').trim().toLowerCase()
	if (role === 'admin' || role === 'produtor' || role === 'consumidor') return role
	return 'consumidor'
}

function obterCapacidadesTransferencia(user) {
	const role = normalizarRole(user)
	const allowedExportRootTypes = EXPORT_ROOT_TYPES_BY_ROLE[role] || []
	const allowedImportRootTypes = IMPORT_ROOT_TYPES_BY_ROLE[role] || []

	return {
		role,
		allowedExportRootTypes,
		allowedImportRootTypes,
		canExport: allowedExportRootTypes.length > 0,
		canImport: allowedImportRootTypes.length > 0,
		forceResourceVisibility: role === 'consumidor' ? 'publico' : '',
	}
}

function restringirFiltrosTransferenciaPorPerfil(filtros, user, mode = 'export') {
	const capacidades = obterCapacidadesTransferencia(user)
	const allowedRootTypes = mode === 'import'
		? capacidades.allowedImportRootTypes
		: capacidades.allowedExportRootTypes

	const filtrosRestritos = {
		...filtros,
		selectedTypes: Array.isArray(filtros?.selectedTypes)
			? filtros.selectedTypes.filter((tipo) => allowedRootTypes.includes(tipo))
			: [],
	}

	if (filtrosRestritos.scope !== 'all' && !allowedRootTypes.includes(filtrosRestritos.scope)) {
		filtrosRestritos.scope = 'all'
	}

	if (capacidades.forceResourceVisibility) {
		filtrosRestritos.resourceVisibility = capacidades.forceResourceVisibility
	}

	if (
		mode === 'import'
		&& allowedRootTypes.length === 1
		&& filtrosRestritos.scope === 'all'
		&& (!Array.isArray(filtrosRestritos.selectedTypes) || filtrosRestritos.selectedTypes.length === 0)
	) {
		filtrosRestritos.selectedTypes = [...allowedRootTypes]
	}

	return filtrosRestritos
}

function filtrarNoticiasRelacionadasARecursos(items, resourceIds, user) {
	const capacidades = obterCapacidadesTransferencia(user)
	if (capacidades.role === 'admin') return Array.isArray(items) ? items : []

	const idsPermitidos = new Set((resourceIds || []).map((id) => String(id)))
	if (!idsPermitidos.size) return []

	return (Array.isArray(items) ? items : []).filter((item) => {
		const eventType = String(item?.eventType || '')

		if (eventType === 'system.new_submission') {
			return item?.payload?.resourceId && idsPermitidos.has(String(item.payload.resourceId))
		}

		if (eventType === 'system.top3') {
			const entradas = Array.isArray(item?.payload?.items) ? item.payload.items : []
			return entradas.length > 0 && entradas.every((entry) => idsPermitidos.has(String(entry?.id)))
		}

		if (item?.payload?.resourceId) {
			return idsPermitidos.has(String(item.payload.resourceId))
		}

		return false
	})
}

module.exports = {
	obterCapacidadesTransferencia,
	restringirFiltrosTransferenciaPorPerfil,
	filtrarNoticiasRelacionadasARecursos,
}