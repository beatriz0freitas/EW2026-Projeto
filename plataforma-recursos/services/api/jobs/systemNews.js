const Resource = require('../models/Resource')
const Rating = require('../models/Rating')
const NewsItem = require('../models/NewsItem')
const { publishNews } = require('../lib/newsPublisher')

function stableTop3Signature(items) {
	return JSON.stringify(
		(items || []).map((item) => ({
			id: String(item.id),
			downloads: Number(item.downloads || 0),
			ratingMedia: Number(item.ratingMedia || 0),
			ratingTotal: Number(item.ratingTotal || 0),
		}))
	)
}

async function getLatestSystemNews(eventType) {
	return NewsItem.findOne({ tipo: 'system', eventType }).sort({ publicadoEm: -1, _id: -1 }).lean()
}

async function buildRatingMap() {
	const stats = await Rating.aggregate([
		{
			$group: {
				_id: '$resourceId',
				media: { $avg: '$stars' },
				total: { $sum: 1 },
			},
		},
	])

	const map = new Map()
	for (const row of stats) {
		map.set(String(row._id), {
			media: Number((row.media || 0).toFixed(2)),
			total: row.total || 0,
		})
	}
	return map
}

async function computeTop3() {
	const resources = await Resource.find(
		{ 'metadata.resource.visibilidade': 'publico' },
		{
			'metadata.resource.titulo': 1,
			'metadata.resource.tipo': 1,
			downloadCount: 1,
		}
	).lean()

	if (!resources.length) return []

	const ratingMap = await buildRatingMap()
	return resources
		.map((resource) => {
			const ratings = ratingMap.get(String(resource._id)) || { media: 0, total: 0 }
			const downloads = Number(resource.downloadCount || 0)
			const score = downloads * 5 + ratings.total + ratings.media
			return {
				id: String(resource._id),
				titulo: resource?.metadata?.resource?.titulo || 'recurso sem titulo',
				tipo: resource?.metadata?.resource?.tipo || null,
				downloads,
				ratingMedia: ratings.media,
				ratingTotal: ratings.total,
				score,
			}
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 3)
}

async function publishTop3NewsIfChanged() {
	const ranked = await computeTop3()
	if (!ranked.length) return { created: false, reason: 'empty' }

	const signature = stableTop3Signature(ranked)
	const latest = await getLatestSystemNews('system.top3')
	const latestSignature = stableTop3Signature(latest?.payload?.items || [])

	if (latest && latestSignature === signature) {
		return { created: false, reason: 'unchanged', item: latest }
	}

	const conteudo = ranked
		.map((item, idx) => {
			const stars = item.ratingTotal > 0 ? `${item.ratingMedia} (${item.ratingTotal} votos)` : 'sem votos'
			return `${idx + 1}. ${item.titulo} - downloads: ${item.downloads}, rating: ${stars}`
		})
		.join(' | ')

	const now = new Date()
	const result = await publishNews({
		tipo: 'system',
		eventType: 'system.top3',
		dedupeKey: `system.top3:${now.toISOString()}`,
		titulo: 'Top3 de recursos mais requisitados',
		conteudo,
		createdBy: 'system',
		payload: {
			generatedAt: now.toISOString(),
			items: ranked,
		},
	})

	return { created: result.created, reason: 'changed', item: result.item }
}

function initSystemNewsTriggers() {
	console.log('[api][system-news] change-driven mode enabled')
}

module.exports = {
	initSystemNewsTriggers,
	publishTop3NewsIfChanged,
}
