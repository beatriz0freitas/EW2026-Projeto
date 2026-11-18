const { apiErrorMessage } = require('../lib/web')
const { apiRequest } = require('../lib/http')

const MAX_TEXT_LENGTH = 500
const DEFAULT_TOP_K = 5
const TOP_K_OPTIONS = [3, 5, 8, 10]

const METHOD_LABELS = {
	llm_rerank: 'Reordenado e justificado pelo modelo local.',
	semantic_fallback: 'Ordenado por similaridade vetorial (fallback do modelo local).',
}

function parseTopK(raw) {
	const value = Number(raw)
	if (!Number.isInteger(value)) return DEFAULT_TOP_K
	return Math.min(20, Math.max(1, value))
}

/**
 * Resolve o título de cada recurso citado numa resposta da IA.
 * As chamadas à API são tolerantes a falhas: sem título, usa-se o ID.
 */
async function resolveTitles(req, ids) {
	const uniqueIds = Array.from(new Set(ids.map(String))).slice(0, 20)
	const lookups = await Promise.allSettled(
		uniqueIds.map((id) => apiRequest(`/resources/${id}`, { token: req.session.token, req }))
	)
	const labels = []
	lookups.forEach((lookup, index) => {
		const data = lookup.status === 'fulfilled' ? lookup.value?.data : null
		const titulo = data?.resource?.metadata?.resource?.titulo
		const idText = uniqueIds[index]
		labels.push({ id: idText, label: titulo || `Recurso ${idText.slice(-6)}` })
	})
	return labels
}

function decorateRecommendations(req, recommendations) {
	const ids = recommendations.map((item) => item?.resourceId).filter(Boolean)
	return resolveTitles(req, ids).then((titles) => {
		const titleById = new Map(titles.map((entry) => [entry.id, entry.label]))
		return recommendations.map((item) => ({
			...item,
			scorePercent: Math.round(Number(item?.relevanceScore || 0) * 100),
			titulo: titleById.get(String(item?.resourceId)) || `Recurso ${item?.resourceId}`,
			href: `/resources/${item?.resourceId}`,
		}))
	})
}

function decorateCitations(req, citations) {
	const ids = citations.map((item) => item?.resourceId).filter(Boolean)
	return resolveTitles(req, ids).then((titles) => {
		const titleById = new Map(titles.map((entry) => [entry.id, entry.label]))
		return citations.map((item) => ({
			...item,
			titulo: titleById.get(String(item?.resourceId)) || `Recurso ${item?.resourceId}`,
			href: `/resources/${item?.resourceId}`,
		}))
	})
}

function showRecommend(req, res) {
	res.render('ai/recommend', {
		title: 'Recomendações IA',
		topKOptions: TOP_K_OPTIONS,
		topK: DEFAULT_TOP_K,
		learningGoal: '',
	})
}

async function recommend(req, res) {
	const learningGoal = String(req.body?.learningGoal || '').trim()
	const topK = parseTopK(req.body?.topK)
	const baseLocals = {
		title: 'Recomendações IA',
		topKOptions: TOP_K_OPTIONS,
		topK,
		learningGoal,
	}

	if (!learningGoal) {
		return res.render('ai/recommend', {
			...baseLocals,
			error: 'Descreve o teu objetivo de aprendizagem para gerar recomendações.',
		})
	}
	if (learningGoal.length > MAX_TEXT_LENGTH) {
		return res.render('ai/recommend', {
			...baseLocals,
			error: `O objetivo de aprendizagem não pode exceder ${MAX_TEXT_LENGTH} caracteres.`,
		})
	}

	const response = await apiRequest('/ai/recommend', {
		method: 'POST',
		token: req.session.token,
		req,
		body: { learningGoal, topK },
	})

	if (!response.ok) {
		return res.render('ai/recommend', {
			...baseLocals,
			error: apiErrorMessage(response.data, 'Não foi possível obter recomendações neste momento.'),
		})
	}

	const recommendationsRaw = Array.isArray(response.data?.recommendations) ? response.data.recommendations : []
	const recommendations = await decorateRecommendations(req, recommendationsRaw)

	res.render('ai/recommend', {
		...baseLocals,
		recommendations,
		methodLabel: METHOD_LABELS[response.data?.method] || 'Sugestões geradas pelo modelo local.',
		model: response.data?.model || null,
	})
}

function showAsk(req, res) {
	res.render('ai/ask', {
		title: 'Perguntar aos Recursos',
		question: '',
	})
}

async function askQuestion(req, res) {
	const question = String(req.body?.question || '').trim()
	const topK = parseTopK(req.body?.topK)
	const baseLocals = {
		title: 'Perguntar aos Recursos',
		topKOptions: TOP_K_OPTIONS,
		topK,
		question,
	}

	if (!question) {
		return res.render('ai/ask', {
			...baseLocals,
			error: 'Escreve a pergunta sobre os recursos educativos.',
		})
	}
	if (question.length > MAX_TEXT_LENGTH) {
		return res.render('ai/ask', {
			...baseLocals,
			error: `A pergunta não pode exceder ${MAX_TEXT_LENGTH} caracteres.`,
		})
	}

	const response = await apiRequest('/ai/ask', {
		method: 'POST',
		token: req.session.token,
		req,
		body: { question, topK },
	})

	if (!response.ok) {
		return res.render('ai/ask', {
			...baseLocals,
			error: apiErrorMessage(response.data, 'Não foi possível processar a pergunta neste momento.'),
		})
	}

	const citationsRaw = Array.isArray(response.data?.citations) ? response.data.citations : []
	const citations = await decorateCitations(req, citationsRaw)

	res.render('ai/ask', {
		...baseLocals,
		answer: response.data?.answer || '',
		citations,
		insufficientEvidence: Boolean(response.data?.insufficientEvidence),
		model: response.data?.model || null,
	})
}

module.exports = {
	showRecommend,
	recommend,
	showAsk,
	askQuestion,
}
