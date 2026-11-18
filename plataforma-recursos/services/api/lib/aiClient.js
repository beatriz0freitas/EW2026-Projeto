const { config } = require('./config')

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai:8000'
const INTERNAL_SERVICE_TOKEN = config.internal.serviceToken
const REQUEST_TIMEOUT_MS = 30000

class AiClient {
	async _makeRequest(path, { method = 'GET', data, requireOkStatus = true } = {}) {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		let response
		try {
			response = await fetch(`${AI_SERVICE_URL}${path}`, {
				method,
				headers: {
					Accept: 'application/json',
					...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
					'X-Internal-Token': INTERNAL_SERVICE_TOKEN,
				},
				body: data !== undefined ? JSON.stringify(data) : undefined,
				signal: controller.signal,
			})
		} catch (error) {
			if (error.name === 'AbortError') {
				throw new Error('ai service: request timeout')
			}
			throw new Error('ai service: connection refused - service may be down')
		} finally {
			clearTimeout(timeout)
		}

		const payload = await response.json().catch(() => null)

		if (requireOkStatus) {
			if (response.status === 401) {
				throw new Error('ai service: unauthorized - check INTERNAL_SERVICE_TOKEN')
			}
			if (response.status === 403) {
				throw new Error('ai service: forbidden - invalid token')
			}
			if (response.status >= 400) {
				throw new Error(`ai service: ${response.status} - ${JSON.stringify(payload)}`)
			}
		}

		return { status: response.status, data: payload }
	}

	async _request(method, endpoint, data, allowedIds) {
		const { data: payload } = await this._makeRequest(endpoint, {
			method,
			data: { ...data, allowed_ids: allowedIds },
		})
		return payload
	}

	/**
	 * Get recommendations for a learning goal
	 * @param {string} learningGoal - The user's learning objective
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} topK - Number of recommendations to return
	 * @returns {Promise<Object>} - Recommendation response with method, recommendations, model, indexVersion
	 */
	async recommend(learningGoal, allowedIds, topK = 5) {
		return this._request('POST', '/recommend', { learningGoal, topK }, allowedIds)
	}

	/**
	 * Ask a question using RAG
	 * @param {string} question - The user's question
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} topK - Number of context items to retrieve
	 * @returns {Promise<Object>} - RAG response with answer, citations, insufficientEvidence, model, indexVersion
	 */
	async ask(question, allowedIds, topK = 5) {
		return this._request('POST', '/ask', { question, topK }, allowedIds)
	}

	/**
	 * Search resources semantically
	 * @param {string} query - The search query
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} topK - Number of results to return
	 * @returns {Promise<Object>} - Search response with items and indexVersion
	 */
	async search(query, allowedIds, topK = 5) {
		return this._request('POST', '/search', { query, topK }, allowedIds)
	}

	/**
	 * Get thematic clusters
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} nClusters - Number of clusters to create
	 * @returns {Promise<Object>} - Cluster response with clusters and indexVersion
	 */
	async cluster(allowedIds, nClusters = 5) {
		return this._request('POST', '/cluster', { nClusters }, allowedIds)
	}

	/**
	 * Check AI service health
	 * @returns {Promise<Object>} - Health status
	 */
	async health() {
		try {
			const { status, data } = await this._makeRequest('/health')
			if (status === 200) {
				return data
			}
			return { status: 'unavailable', ollama: 'unreachable' }
		} catch {
			return { status: 'unavailable', ollama: 'unreachable' }
		}
	}

	/**
	 * Check if AI service is alive
	 * @returns {Promise<boolean>}
	 */
	async isAlive() {
		try {
			const { status } = await this._makeRequest('/live')
			return status === 200
		} catch {
			return false
		}
	}
}

module.exports = { AiClient, AI_SERVICE_URL, INTERNAL_SERVICE_TOKEN }
