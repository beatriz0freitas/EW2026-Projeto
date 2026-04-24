/**
 * routes/export.js
 *
 * GET  /api/export          — exporta todos os dados (recursos, taxonomia, notícias, ratings, comentários)
 *                             como JSON. Requer autenticação de admin.
 *
 * POST /api/import          — importa um dump gerado pelo endpoint acima.
 *                             Requer autenticação de admin.
 *                             Estratégia: upsert por _id para ser idempotente (pode ser chamado várias vezes).
 *
 * Nota: os ficheiros AIP em disco NÃO são incluídos no dump JSON — para uma
 * migração completa é necessário copiar também a pasta AIP_DIR separadamente.
 * O dump JSON é suficiente para restaurar os metadados e a estrutura da plataforma.
 */

const express = require('express')

const Resource = require('../models/Resource')
const Taxonomy = require('../models/Taxonomy')
const NewsItem = require('../models/NewsItem')
const Rating = require('../models/Rating')
const Comment = require('../models/Comment')
const { requireLevel } = require('../middleware/auth')
const { jsonError } = require('../lib/http')

const router = express.Router()


// GET /api/export
router.get('/export', requireLevel('admin'), async (req, res) => {
	try {
		const [resources, taxonomy, news, ratings, comments] = await Promise.all([
			Resource.find().lean(),
			Taxonomy.find().lean(),
			NewsItem.find().lean(),
			Rating.find().lean(),
			Comment.find().lean(),
		])

		const dump = {
			version: '1',
			exportedAt: new Date().toISOString(),
			resources,
			taxonomy,
			news,
			ratings,
			comments,
		}

		res.setHeader('Content-Disposition', `attachment; filename="ew2026-export-${Date.now()}.json"`)
		res.setHeader('Content-Type', 'application/json')
		res.json(dump)
	} catch (err) {
		console.error('[export] erro:', err)
		jsonError(res, 500, 'erro interno ao exportar')
	}
})


// POST /api/import
// Recebe o dump JSON produzido pelo GET /api/export

router.post('/import', requireLevel('admin'), async (req, res) => {
	const dump = req.body

	// Validação mínima do formato do dump
	if (!dump || dump.version !== '1') {
		return jsonError(res, 400, {
			code: 'INVALID_DUMP',
			message: 'dump inválido ou versão não suportada (esperado version: "1")',
		})
	}

	const results = {
		resources: { upserted: 0, errors: [] },
		taxonomy: { upserted: 0, errors: [] },
		news: { upserted: 0, errors: [] },
		ratings: { upserted: 0, errors: [] },
		comments: { upserted: 0, errors: [] },
	}

	// Helper: upsert genérico por _id
	async function upsertAll(Model, docs, key) {
		if (!Array.isArray(docs)) return
		for (const doc of docs) {
			try {
				await Model.findByIdAndUpdate(doc._id, { $set: doc }, { upsert: true, new: true })
				results[key].upserted++
			} catch (err) {
				results[key].errors.push({ id: String(doc._id), message: err.message })
			}
		}
	}

	await upsertAll(Resource, dump.resources, 'resources')
	await upsertAll(Taxonomy, dump.taxonomy, 'taxonomy')
	await upsertAll(NewsItem, dump.news, 'news')
	await upsertAll(Rating, dump.ratings, 'ratings')
	await upsertAll(Comment, dump.comments, 'comments')

	const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0)

	res.status(totalErrors === 0 ? 200 : 207).json({
		ok: totalErrors === 0,
		results,
	})
})

module.exports = router