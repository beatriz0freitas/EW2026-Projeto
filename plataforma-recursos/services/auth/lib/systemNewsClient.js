const { config } = require('./config')

async function publishNewUserRegisteredNews(user) {
	if (!user || !user._id) return false

	const payload = {
		eventType: 'system.new_user',
		dedupeKey: `system.new_user:${String(user._id)}`,
		titulo: 'Novo utilizador registado',
		conteudo: `Foi registado um novo utilizador: ${user.nome || user._id}.`,
		createdBy: 'system',
		payload: {
			userId: String(user._id),
			role: user.role || 'consumidor',
			nome: user.nome || null,
			dataRegisto: user.data_registo || null,
		},
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
	publishNewUserRegisteredNews,
}
