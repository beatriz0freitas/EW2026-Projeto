const User = require('../models/User')
const { jsonError } = require('../lib/http')

module.exports.me = async (req, res) => {
	try {
		const user = await User.findById(req.user.sub).select('-password')
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador não encontrado' })

		await User.updateOne({ _id: user._id }, { ultimo_acesso: new Date() })

		res.json({ ok: true, user })
	} catch {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}
