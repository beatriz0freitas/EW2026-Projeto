const UserService = require('../services/userService')
const { jsonError } = require('../lib/http')

module.exports.exportUsers = async (req, res) => {
	try {
		const users = await UserService.exportForTransfer()
		res.json({ ok: true, users })
	} catch (err) {
		console.error('[auth] erro ao exportar users para transferencia:', err)
		jsonError(res, 500, { code: 'USERS_EXPORT_FAILED', message: 'erro interno ao exportar utilizadores' })
	}
}

module.exports.importUsers = async (req, res) => {
	try {
		if (!Array.isArray(req.body?.users)) {
			return jsonError(res, 400, {
				code: 'INVALID_USERS_DUMP',
				message: 'campo users tem de ser uma lista',
			})
		}

		const results = await UserService.importForTransfer(req.body.users)
		const totalErrors = results.errors.length
		res.status(totalErrors === 0 ? 200 : 207).json({ ok: totalErrors === 0, results })
	} catch (err) {
		console.error('[auth] erro ao importar users de transferencia:', err)
		jsonError(res, 500, { code: 'USERS_IMPORT_FAILED', message: 'erro interno ao importar utilizadores' })
	}
}
