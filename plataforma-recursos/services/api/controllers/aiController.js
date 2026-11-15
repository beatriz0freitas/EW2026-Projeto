const { AiClient } = require('../lib/aiClient')
const { canViewResource, visibilityQuery } = require('../lib/resourceAccess')
const Resource = require('../models/Resource')
const { jsonError, jsonSuccess } = require('../lib/http')

const aiClient = new AiClient()

/**
 * Get authorized resource IDs for a user
 * @param {Object} user - Authenticated user object or null for anonymous
 * @returns {Promise<string[]>} - Array of MongoDB ObjectId strings
 */
async function getAuthorizedResourceIds(user) {
	const query = visibilityQuery(user)
	const resources = await Resource.find(query).select('_id').lean()
	return resources.map((r) => String(r._id))
}

/**
 * Validate AI response items against ACL
 * @param {Array} items - Array of items from AI service
 * @param {Object} user - Authenticated user object or null
 * @returns {Array} - Filtered array with only authorized items
 */
async function filterByAcl(items, user) {
	if (!items || !Array.isArray(items)) {
		return []
	}

	const authorizedIds = await getAuthorizedResourceIds(user)
	const authorizedSet = new Set(authorizedIds)

	// For search results, filter by authorized IDs
	if (items.length > 0 && items[0].resourceId) {
		return items.filter((item) => authorizedSet.has(String(item.resourceId)))
	}

	return items
}

/**
 * Validate recommendation items against ACL
 * @param {Array} recommendations - Array of recommendation objects
 * @param {Object} user - Authenticated user object or null
 * @returns {Array} - Filtered array with only authorized recommendations
 */
async function validateRecommendations(recommendations, user) {
	if (!recommendations || !Array.isArray(recommendations)) {
		return []
	}

	const authorizedIds = await getAuthorizedResourceIds(user)
	const authorizedSet = new Set(authorizedIds)

	return recommendations.filter((rec) => {
		if (!rec || !rec.resourceId) return false
		const resourceId = String(rec.resourceId)
		// Double-check: ensure the resource is in our authorized list
		return authorizedSet.has(resourceId)
	})
}

/**
 * Validate search items against ACL
 * @param {Array} items - Array of search items
 * @param {Object} user - Authenticated user object or null
 * @returns {Array} - Filtered array with only authorized items
 */
async function validateSearchItems(items, user) {
	if (!items || !Array.isArray(items)) {
		return []
	}

	const authorizedIds = await getAuthorizedResourceIds(user)
	const authorizedSet = new Set(authorizedIds)

	return items.filter((item) => {
		if (!item || !item.resourceId) return false
		const resourceId = String(item.resourceId)
		return authorizedSet.has(resourceId)
	})
}

/**
 * Validate cluster resource IDs against ACL
 * @param {Array} clusters - Array of cluster objects
 * @param {Object} user - Authenticated user object or null
 * @returns {Array} - Filtered clusters with only authorized resource IDs
 */
async function validateClusters(clusters, user) {
	if (!clusters || !Array.isArray(clusters)) {
		return []
	}

	const authorizedIds = await getAuthorizedResourceIds(user)
	const authorizedSet = new Set(authorizedIds)

	return clusters.map((cluster) => {
		if (!cluster || !cluster.resourceIds) return cluster
		return {
			...cluster,
			resourceIds: cluster.resourceIds.filter((id) => authorizedSet.has(String(id))),
		}
	}).filter((c) => c.resourceIds && c.resourceIds.length > 0)
}

/**
 * Validate citations against ACL
 * @param {Array} citations - Array of citation objects
 * @param {Object} user - Authenticated user object or null
 * @returns {boolean} - True if all citations are authorized
 */
async function validateCitations(citations, user) {
	if (!citations || citations.length === 0) {
		return true
	}

	const authorizedIds = await getAuthorizedResourceIds(user)
	const authorizedSet = new Set(authorizedIds)

	return citations.every((citation) => {
		if (!citation || !citation.resourceId) return false
		return authorizedSet.has(String(citation.resourceId))
	})
}

// ============ Controller Methods ============

/**
 * POST /api/ai/recommend - Get pedagogical recommendations
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function recommend(req, res) {
	try {
		const { learningGoal, topK = 5 } = req.body
		const user = req.user

		if (!learningGoal || typeof learningGoal !== 'string' || !learningGoal.trim()) {
			return jsonError(res, 400, { code: 'INVALID_LEARNING_GOAL', message: 'learningGoal is required and must be a non-empty string' })
		}

		// Get authorized resource IDs
		const allowedIds = await getAuthorizedResourceIds(user)

		// Call AI service
		const result = await aiClient.recommend(learningGoal, allowedIds, topK)

		// Validate recommendations against ACL (defense in depth)
		result.recommendations = await validateRecommendations(result.recommendations, user)

		return jsonSuccess(res, result)
	} catch (error) {
		console.error('[aiController] recommend error:', error)
		if (error.message && error.message.includes('ai service:')) {
			return jsonError(res, 503, { code: 'AI_SERVICE_UNAVAILABLE', message: error.message })
		}
		return jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro ao gerar recomendações' })
	}
}

/**
 * POST /api/ai/ask - Ask a question using RAG
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function ask(req, res) {
	try {
		const { question, topK = 5 } = req.body
		const user = req.user

		if (!question || typeof question !== 'string' || !question.trim()) {
			return jsonError(res, 400, { code: 'INVALID_QUESTION', message: 'question is required and must be a non-empty string' })
		}

		// Get authorized resource IDs
		const allowedIds = await getAuthorizedResourceIds(user)

		// Call AI service
		const result = await aiClient.ask(question, allowedIds, topK)

		// Validate citations against ACL (defense in depth)
		const citationsValid = await validateCitations(result.citations, user)
		if (!citationsValid) {
			// Remove unauthorized citations
			result.citations = result.citations.filter((c) => allowedIds.includes(String(c.resourceId)))
		}

		return jsonSuccess(res, result)
	} catch (error) {
		console.error('[aiController] ask error:', error)
		if (error.message && error.message.includes('ai service:')) {
			return jsonError(res, 503, { code: 'AI_SERVICE_UNAVAILABLE', message: error.message })
		}
		return jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro ao processar pergunta' })
	}
}

/**
 * POST /api/ai/search - Semantic search
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function search(req, res) {
	try {
		const { query, topK = 5 } = req.body
		const user = req.user

		if (!query || typeof query !== 'string' || !query.trim()) {
			return jsonError(res, 400, { code: 'INVALID_QUERY', message: 'query is required and must be a non-empty string' })
		}

		// Get authorized resource IDs
		const allowedIds = await getAuthorizedResourceIds(user)

		// Call AI service
		const result = await aiClient.search(query, allowedIds, topK)

		// Validate search results against ACL (defense in depth)
		result.items = await validateSearchItems(result.items, user)

		return jsonSuccess(res, result)
	} catch (error) {
		console.error('[aiController] search error:', error)
		if (error.message && error.message.includes('ai service:')) {
			return jsonError(res, 503, { code: 'AI_SERVICE_UNAVAILABLE', message: error.message })
		}
		return jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro ao realizar pesquisa' })
	}
}

/**
 * POST /api/ai/cluster - Get thematic clusters
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function cluster(req, res) {
	try {
		const { nClusters = 5 } = req.body
		const user = req.user

		if (!Number.isInteger(nClusters) || nClusters < 1 || nClusters > 20) {
			return jsonError(res, 400, { code: 'INVALID_CLUSTER_COUNT', message: 'nClusters must be an integer between 1 and 20' })
		}

		// Get authorized resource IDs
		const allowedIds = await getAuthorizedResourceIds(user)

		// Call AI service
		const result = await aiClient.cluster(allowedIds, nClusters)

		// Validate cluster resource IDs against ACL (defense in depth)
		result.clusters = await validateClusters(result.clusters, user)

		return jsonSuccess(res, result)
	} catch (error) {
		console.error('[aiController] cluster error:', error)
		if (error.message && error.message.includes('ai service:')) {
			return jsonError(res, 503, { code: 'AI_SERVICE_UNAVAILABLE', message: error.message })
		}
		return jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro ao gerar clusters' })
	}
}

module.exports = {
	recommend,
	ask,
	search,
	cluster,
	getAuthorizedResourceIds,
	// Exported for testing
	_validateRecommendations: validateRecommendations,
	_validateSearchItems: validateSearchItems,
	_validateClusters: validateClusters,
	_validateCitations: validateCitations,
}
