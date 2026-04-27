const { config } = require('./config')

async function publishUsersCountChangedNews(counts) {
	const normalizedCounts = {
		totalUsers: Number(counts?.totalUsers || 0),
		totalActiveUsers: Number(counts?.totalActiveUsers || 0),
	}

	const payload = {
		eventType: 'system.total_users',
		titulo: 'Atualizacao de utilizadores da plataforma',
		conteudo: `O sistema tem agora ${normalizedCounts.totalActiveUsers} utilizadores ativos (${normalizedCounts.totalUsers} no total).`,
		createdBy: 'system',
		payload: normalizedCounts,
	}

	try {
		const response = await fetch(`${config.services.apiUrl}/api/news/system`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'X-Internal-Token': config.internal.serviceToken,
			},
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			console.error('[auth] warning: API rejected system news publish with status', response.status)
			return false
		}

		return true
	} catch (err) {
		console.error('[auth] warning: could not publish system news to API:', err)
		return false
	}
}

module.exports = {
	publishUsersCountChangedNews,
}
