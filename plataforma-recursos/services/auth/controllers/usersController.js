const UserService = require('../services/userService')
const { jsonError } = require('../lib/http')
const { publishUsersCountChangedNews } = require('../lib/systemNewsClient')

module.exports.register = async (req, res) => {
	try {
		const user = await UserService.insert(req.body, { publicRegistration: true })
		const counts = await UserService.getStats()

		publishUsersCountChangedNews(counts).catch((err) => {
			console.error('[auth] warning: could not publish users-count news:', err)
		})

		res.status(201).json({ ok: true, user })
	} catch (err) {
		const msg = String(err?.message || '').toLowerCase()
		if (msg.includes('email') && msg.includes('registado')) {
			return jsonError(res, 409, { code: 'DUPLICATE_EMAIL', message: 'email ja registado' })
		}
		if (msg.includes('obrigatorios') || msg.includes('password')) {
			return jsonError(res, 400, { code: 'INVALID_INPUT', message: err.message })
		}
		console.error('[auth] register error:', err)
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}

module.exports.listUsers = async (req, res) => {
	try {
		const users = await UserService.list()
		res.json({ ok: true, users })
	} catch {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}

module.exports.getUserById = async (req, res) => {
	try {
		const canAccess = req.user.role === 'admin' || String(req.user.sub) === String(req.params.id)
		if (!canAccess) {
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'permissoes insuficientes' })
		}

		const user = await UserService.findById(req.params.id)
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador nao encontrado' })

		res.json({ ok: true, user })
	} catch {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}

module.exports.patchUserById = async (req, res) => {
	try {
		const user = await UserService.update(req.params.id, req.body)
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador nao encontrado' })
		res.json({ ok: true, user })
	} catch (err) {
		if (String(err?.message || '').toLowerCase().includes('invalido')) {
			return jsonError(res, 400, { code: 'INVALID_ROLE', message: err.message })
		}
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}

module.exports.deleteUserById = async (req, res) => {
	try {
		if (String(req.user.sub) === String(req.params.id)) {
			return jsonError(res, 400, {
				code: 'SELF_DELETE_FORBIDDEN',
				message: 'nao podes desativar o teu proprio utilizador',
			})
		}

		const user = await UserService.remove(req.params.id)
		if (!user) {
			return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador nao encontrado' })
		}

		res.json({ ok: true, user })
	} catch {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}
