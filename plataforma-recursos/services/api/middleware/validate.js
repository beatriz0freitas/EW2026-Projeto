const { jsonError } = require('../lib/http')

function campoTextoVazio(valor) {
	return typeof valor !== 'string' || valor.trim() === ''
}

function validarCamposTextoObrigatoriosNoBody(campos) {
	return (req, res, next) => {
		for (const campo of campos) {
			if (campoTextoVazio(req.body?.[campo])) {
				return jsonError(res, 400, {
					code: 'INVALID_INPUT',
					message: `${campo} é obrigatório`,
				})
			}
		}

		next()
	}
}

function validarInteiroNoBody(campo, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
	return (req, res, next) => {
		const valor = Number(req.body?.[campo])
		if (!Number.isInteger(valor) || valor < min || valor > max) {
			return jsonError(res, 400, {
				code: 'INVALID_INPUT',
				message: `${campo} deve ser um inteiro entre ${min} e ${max}`,
			})
		}

		req.body[campo] = valor
		next()
	}
}

function validarPaginacaoNaQuery({ limiteMaximo = 100 } = {}) {
	return (req, res, next) => {
		const { page, limit } = req.query || {}

		if (page !== undefined) {
			const pagina = Number(page)
			if (!Number.isInteger(pagina) || pagina < 1) {
				return jsonError(res, 400, {
					code: 'INVALID_QUERY',
					message: 'page deve ser um inteiro maior ou igual a 1',
				})
			}
		}

		if (limit !== undefined) {
			const limite = Number(limit)
			if (!Number.isInteger(limite) || limite < 1 || limite > limiteMaximo) {
				return jsonError(res, 400, {
					code: 'INVALID_QUERY',
					message: `limit deve ser um inteiro entre 1 e ${limiteMaximo}`,
				})
			}
		}

		next()
	}
}

function validarInteiroOpcionalNaQuery(campo, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
	return (req, res, next) => {
		const valorBruto = req.query?.[campo]
		if (valorBruto === undefined || valorBruto === '') return next()

		const valor = Number(valorBruto)
		if (!Number.isInteger(valor) || valor < min || valor > max) {
			return jsonError(res, 400, {
				code: 'INVALID_QUERY',
				message: `${campo} deve ser um inteiro entre ${min} e ${max}`,
			})
		}

		req.query[campo] = valor
		next()
	}
}

module.exports = {
	validarCamposTextoObrigatoriosNoBody,
	validarInteiroNoBody,
	validarPaginacaoNaQuery,
	validarInteiroOpcionalNaQuery,
}
