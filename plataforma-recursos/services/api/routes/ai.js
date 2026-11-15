const express = require('express')
const { recommend, ask, search, cluster } = require('../controllers/aiController')

const router = express.Router()

/**
 * POST /api/ai/recommend
 * Get pedagogical recommendations for a learning goal
 * Body: { learningGoal: string, topK?: number }
 * Response: { method: string, recommendations: Array, model?: string, indexVersion: string }
 */
router.post('/recommend', recommend)

/**
 * POST /api/ai/ask
 * Ask a question using RAG with citations
 * Body: { question: string, topK?: number }
 * Response: { answer: string, citations: Array, insufficientEvidence: boolean,
 *   model: string, indexVersion: string }
 */
router.post('/ask', ask)

/**
 * POST /api/ai/search
 * Semantic search for resources
 * Body: { query: string, topK?: number }
 * Response: { items: Array, indexVersion: string }
 */
router.post('/search', search)

/**
 * POST /api/ai/cluster
 * Get thematic clusters of resources
 * Body: { nClusters?: number }
 * Response: { clusters: Array, indexVersion: string }
 */
router.post('/cluster', cluster)

module.exports = router
