const axios = require('axios')
const { config } = require('./config')
const { jsonError } = require('./http')

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai:8000'
const INTERNAL_SERVICE_TOKEN = config.internal.serviceToken

class AiClient {
	constructor() {
		this.client = axios.create({
			baseURL: AI_SERVICE_URL,
			timeout: 30000,
			validateStatus: (status) => status < 500,
		})
	}

	async _makeRequest(method, endpoint, data, allowedIds) {
		try {
			const response = await this.client.request({
				method,
				url: endpoint,
				headers: {
					'X-Internal-Token': INTERNAL_SERVICE_TOKEN,
					'Content-Type': 'application/json',
				},
				data: { ...data, allowed_ids: allowedIds },
			})

			if (response.status === 401) {
				throw new Error('ai service: unauthorized - check INTERNAL_SERVICE_TOKEN')
			}
			if (response.status === 403) {
				throw new Error('ai service: forbidden - invalid token')
			}
			if (response.status >= 400) {
				throw new Error(`ai service: ${response.status} - ${JSON.stringify(response.data)}`)
			}

			return response.data
		} catch (error) {
			if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
				throw new Error('ai service: connection refused - service may be down')
			}
			if (error.code === 'ETIMEDOUT') {
				throw new Error('ai service: request timeout')
			}
			throw error
		}
	}

	/**
	 * Get recommendations for a learning goal
	 * @param {string} learningGoal - The user's learning objective
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} topK - Number of recommendations to return
	 * @returns {Promise<Object>} - Recommendation response with method, recommendations, model, indexVersion
	 */
	async recommend(learningGoal, allowedIds, topK = 5) {
		return this._makeRequest('POST', '/recommend', { learningGoal, topK }, allowedIds)
	}

	/**
	 * Ask a question using RAG
	 * @param {string} question - The user's question
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} topK - Number of context items to retrieve
	 * @returns {Promise<Object>} - RAG response with answer, citations, insufficientEvidence, model, indexVersion
	 */
	async ask(question, allowedIds, topK = 5) {
		return this._makeRequest('POST', '/ask', { question, topK }, allowedIds)
	}

	/**
	 * Search resources semantically
	 * @param {string} query - The search query
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} topK - Number of results to return
	 * @returns {Promise<Object>} - Search response with items and indexVersion
	 */
	async search(query, allowedIds, topK = 5) {
		return this._makeRequest('POST', '/search', { query, topK }, allowedIds)
	}

	/**
	 * Get thematic clusters
	 * @param {string[]} allowedIds - List of resource IDs the user can access
	 * @param {number} nClusters - Number of clusters to create
	 * @returns {Promise<Object>} - Cluster response with clusters and indexVersion
	 */
	async cluster(allowedIds, nClusters = 5) {
		return this._makeRequest('POST', '/cluster', { nClusters }, allowedIds)
	}

	/**
	 * Check AI service health
	 * @returns {Promise<Object>} - Health status
	 */
	async health() {
		try {
			const response = await this.client.get('/health', {
				headers: {
					'X-Internal-Token': INTERNAL_SERVICE_TOKEN,
				},
			})
			if (response.status === 200) {
				return response.data
			}
			return { status: 'unavailable', ollama: 'unreachable' }
		} catch (error) {
			return { status: 'unavailable', ollama: 'unreachable' }
		}
	}

	/**
	 * Check if AI service is alive
	 * @returns {Promise<boolean>}
	 */
	async isAlive() {
		try {
			const response = await this.client.get('/live', {
				headers: {
					'X-Internal-Token': INTERNAL_SERVICE_TOKEN,
				},
			})
			return response.status === 200
		} catch {
			return false
		}
	}
}

module.exports = { AiClient, AI_SERVICE_URL, INTERNAL_SERVICE_TOKEN }
