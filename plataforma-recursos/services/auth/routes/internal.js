const express = require('express')

const User = require('../models/User')
const { requireInternalService } = require('../middleware/internal')
const { jsonError } = require('../lib/http')

const router = express.Router()

router.get('/stats/users-count', requireInternalService, async (req, res) => {
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
	} catch (err) {
		jsonError(res, 500, {
			code: 'INTERNAL_STATS_ERROR',
			message: 'erro interno ao calcular estatisticas',
		})
	}
})

module.exports = router
