'use strict'

const TIPOS_BASE_RECURSO = Object.freeze([
	'artigo',
	'tese',
	'slides',
	'teste',
	'relatorio',
	'aplicacao',
	'problema',
	'outro',
])

function normalizarTipoRecurso(valor) {
	if (typeof valor !== 'string') return ''
	return valor
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase()
}

function tiposBaseRecurso() {
	return [...TIPOS_BASE_RECURSO]
}

module.exports = {
	TIPOS_BASE_RECURSO,
	normalizarTipoRecurso,
	tiposBaseRecurso,
}