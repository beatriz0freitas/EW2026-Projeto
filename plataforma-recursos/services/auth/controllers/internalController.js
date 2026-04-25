const User = require('../models/User')
const { jsonError } = require('../lib/http')

module.exports.usersCount = async (req, res) => {
	try {
		const [totalUsers, totalActiveUsers] = await Promise.all([
			User.countDocuments({}),
			User.countDocuments({ ativo: true }),
		])

		res.json({
			ok: true,
			totalUsers,
			totalActiveUsers,
		})
	} catch {
		jsonError(res, 500, {
			code: 'INTERNAL_STATS_ERROR',
			message: 'erro interno ao calcular estatisticas',
		})
	}
}
