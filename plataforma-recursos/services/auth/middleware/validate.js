const { jsonError } = require('../lib/http')

function textoVazio(valor) {
	return typeof valor !== 'string' || valor.trim() === ''
}

function validarCamposTextoObrigatoriosNoBody(campos, opcoes = {}) {
	return (req, res, next) => {
		for (const campo of campos) {
			if (textoVazio(req.body?.[campo])) {
				const status = opcoes.status || 400
				const codigo = opcoes.code || 'INVALID_INPUT'
				const mensagem = opcoes.message || `${campo} é obrigatório`
				return jsonError(res, status, {
					code: codigo,
					message: mensagem,
				})
			}
		}

		next()
	}
}

function validarCampoObrigatorioNoBody(campo, opcoes = {}) {
	return validarCamposTextoObrigatoriosNoBody([campo], opcoes)
}

function validarPedidoLoginNoBody() {
	return (req, res, next) => {
		const email = req.body?.email
		const username = req.body?.username
		const password = req.body?.password

		const temEmail = !textoVazio(email)
		const temUsername = !textoVazio(username)

		if (!temEmail && !temUsername) {
			return jsonError(res, 400, {
				code: 'INVALID_INPUT',
				message: 'email ou username é obrigatório',
			})
		}

		if (textoVazio(password)) {
			return jsonError(res, 400, {
				code: 'INVALID_INPUT',
				message: 'password é obrigatório',
			})
		}

		next()
	}
}

module.exports = {
	validarCamposTextoObrigatoriosNoBody,
	validarCampoObrigatorioNoBody,
	validarPedidoLoginNoBody,
}
