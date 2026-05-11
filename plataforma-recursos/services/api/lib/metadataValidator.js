/**
 * Contrato único e central para validação de metadata.resource.
 */

'use strict'

const VISIBILIDADES_VALIDAS = new Set(['publico', 'privado'])
const { normalizarTipoRecurso, tiposBaseRecurso } = require('./resourceTypes')

const LIMITES = {
	tipo: { min: 1, max: 80 },
	titulo: { min: 1, max: 200 },
	subtitulo: { max: 200 },
	descricao: { max: 2000 },
	tema: { max: 120 },
	ano: { min: 0, max: 3000 },
	hashtags: { maxEntries: 20, maxLength: 80 },
}

function textoVazio(valor) {
	return typeof valor !== 'string' || valor.trim() === ''
}

function limparTexto(valor) {
	return typeof valor === 'string' ? valor.trim() : ''
}

/**
 * Valida o objecto metadata.resource completo.
 *
 * @param {unknown} resource  — o objecto resource extraído de metadata.resource
 * @returns {{ ok: boolean, errors: Array<{ code: string, message: string }> }}
 */
function validateMetadataResource(resource) {
	const errors = []

	if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
		return {
			ok: false,
			errors: [{ code: 'BAD_METADATA', message: 'metadata.resource deve ser um objeto' }],
		}
	}

	// ── campos obrigatórios ─────────────────────────────────────────────────

	const tipo = normalizarTipoRecurso(resource.tipo)
	if (!tipo) {
		errors.push({ code: 'BAD_METADATA', message: 'metadata.resource.tipo é obrigatório' })
	} else if (tipo.length > LIMITES.tipo.max) {
		errors.push({
			code: 'BAD_METADATA',
			message: `metadata.resource.tipo não pode exceder ${LIMITES.tipo.max} caracteres`,
		})
	} else {
		resource.tipo = tipo
	}

	const titulo = limparTexto(resource.titulo)
	if (!titulo) {
		errors.push({ code: 'BAD_METADATA', message: 'metadata.resource.titulo é obrigatório' })
	} else if (titulo.length > LIMITES.titulo.max) {
		errors.push({
			code: 'BAD_METADATA',
			message: `metadata.resource.titulo não pode exceder ${LIMITES.titulo.max} caracteres`,
		})
	}

	if (resource.visibilidade === undefined || resource.visibilidade === null || resource.visibilidade === '') {
		resource.visibilidade = 'publico'
	}

	if (!VISIBILIDADES_VALIDAS.has(resource.visibilidade)) {
		errors.push({
			code: 'BAD_METADATA',
			message: "metadata.resource.visibilidade deve ser 'publico' ou 'privado'",
		})
	}

	// ── campos opcionais ────────────────────────────────────────────────────

	if (resource.subtitulo !== undefined && resource.subtitulo !== null && resource.subtitulo !== '') {
		const subtitulo = limparTexto(resource.subtitulo)
		if (subtitulo.length > LIMITES.subtitulo.max) {
			errors.push({
				code: 'BAD_METADATA',
				message: `metadata.resource.subtitulo não pode exceder ${LIMITES.subtitulo.max} caracteres`,
			})
		}
	}

	if (resource.descricao !== undefined && resource.descricao !== null && resource.descricao !== '') {
		const descricao = limparTexto(resource.descricao)
		if (descricao.length > LIMITES.descricao.max) {
			errors.push({
				code: 'BAD_METADATA',
				message: `metadata.resource.descricao não pode exceder ${LIMITES.descricao.max} caracteres`,
			})
		}
	}

	if (resource.tema !== undefined && resource.tema !== null && resource.tema !== '') {
		const tema = limparTexto(resource.tema)
		if (tema.length > LIMITES.tema.max) {
			errors.push({
				code: 'BAD_METADATA',
				message: `metadata.resource.tema não pode exceder ${LIMITES.tema.max} caracteres`,
			})
		}
	}

	if (resource.ano !== undefined && resource.ano !== null && resource.ano !== '') {
		const ano = Number(resource.ano)
		if (!Number.isInteger(ano) || ano < LIMITES.ano.min || ano > LIMITES.ano.max) {
			errors.push({
				code: 'BAD_METADATA',
				message: `metadata.resource.ano deve ser um inteiro entre ${LIMITES.ano.min} e ${LIMITES.ano.max}`,
			})
		}
	}

	if (resource.dataCriacao !== undefined && resource.dataCriacao !== null && resource.dataCriacao !== '') {
		const dataCriacao = limparTexto(resource.dataCriacao)
		const timestamp = Date.parse(dataCriacao)
		if (!dataCriacao || Number.isNaN(timestamp)) {
			errors.push({
				code: 'BAD_METADATA',
				message: 'metadata.resource.dataCriacao deve ser uma data ISO 8601 válida',
			})
		}
	}

	if (resource.hashtags !== undefined && resource.hashtags !== null) {
		if (typeof resource.hashtags === 'string') {
			resource.hashtags = resource.hashtags
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean)
		}

		if (!Array.isArray(resource.hashtags)) {
			errors.push({ code: 'BAD_METADATA', message: 'metadata.resource.hashtags deve ser uma lista' })
		} else {
			if (resource.hashtags.length > LIMITES.hashtags.maxEntries) {
				errors.push({
					code: 'BAD_METADATA',
					message: `metadata.resource.hashtags não pode ter mais de ${LIMITES.hashtags.maxEntries} entradas`,
				})
			}

			resource.hashtags.forEach((tag, index) => {
				if (textoVazio(tag)) {
					errors.push({
						code: 'BAD_METADATA',
						message: `metadata.resource.hashtags[${index}] não pode ser vazio`,
					})
					return
				}
				// remove # inicial se presente, para validar o conteúdo
				const tagLimpa = limparTexto(tag).replace(/^#/, '')
				if (!tagLimpa) {
					errors.push({
						code: 'BAD_METADATA',
						message: `metadata.resource.hashtags[${index}] não pode ser apenas '#'`,
					})
					return
				}
				if (tagLimpa.length > LIMITES.hashtags.maxLength) {
					errors.push({
						code: 'BAD_METADATA',
						message: `metadata.resource.hashtags[${index}] não pode exceder ${LIMITES.hashtags.maxLength} caracteres`,
					})
				}
				if (/\s/.test(tagLimpa)) {
					errors.push({
						code: 'BAD_METADATA',
						message: `metadata.resource.hashtags[${index}] não pode conter espaços`,
					})
				}
			})
		}
	}

	return { ok: errors.length === 0, errors }
}

/**
 * Valida o objecto metadata completo (que contém metadata.resource).
 *
 * @param {unknown} metadata
 * @returns {{ ok: boolean, errors: Array<{ code: string, message: string }> }}
 */
function validateMetadata(metadata) {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return {
			ok: false,
			errors: [{ code: 'BAD_METADATA', message: 'metadata deve ser um objeto JSON' }],
		}
	}

	if (!metadata.resource || typeof metadata.resource !== 'object' || Array.isArray(metadata.resource)) {
		return {
			ok: false,
			errors: [{ code: 'BAD_METADATA', message: 'metadata.resource é obrigatório' }],
		}
	}

	return validateMetadataResource(metadata.resource)
}

module.exports = {
	tiposBaseRecurso,
	validateMetadata,
	validateMetadataResource,
}
