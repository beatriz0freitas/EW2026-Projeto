const Resource = require('../models/Resource')
const Rating = require('../models/Rating')
const { config } = require('./config')
const { publishNews } = require('./newsPublisher')

const DAY_MS = 24 * 60 * 60 * 1000

function isoDate(date = new Date()) {
	return date.toISOString().slice(0, 10)
}

function nextRunAt(hour, minute) {
	const now = new Date()
	const run = new Date(now)
	run.setHours(hour, minute, 0, 0)
	if (run <= now) {
		run.setDate(run.getDate() + 1)
	}
	return run
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

async function publishTop3News(now) {
	const resources = await Resource.find({}, {
		'metadata.resource.titulo': 1,
		'metadata.resource.tipo': 1,
		downloadCount: 1,
	}).lean()

	if (!resources.length) return

	const ratingMap = await buildRatingMap()
	const ranked = resources
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

	if (!ranked.length) return

	const conteudo = ranked
		.map((item, idx) => {
			const stars = item.ratingTotal > 0 ? `${item.ratingMedia} (${item.ratingTotal} votos)` : 'sem votos'
			return `${idx + 1}. ${item.titulo} - downloads: ${item.downloads}, rating: ${stars}`
		})
		.join(' | ')

	await publishNews({
		tipo: 'system',
		eventType: 'system.top3',
		dedupeKey: `system.top3:${isoDate(now)}`,
		titulo: 'Top3 de recursos mais requisitados',
		conteudo,
		createdBy: 'system',
		payload: {
			generatedAt: now.toISOString(),
			items: ranked,
		},
	})
}

async function fetchUsersCount() {
	const response = await fetch(`${config.auth.url}/internal/stats/users-count`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'X-Internal-Token': config.internal.serviceToken,
		},
	})

	let payload = null
	try {
		payload = await response.json()
	} catch {
		payload = null
	}

	if (!response.ok || !payload?.ok) {
		const message = payload?.message || `auth returned ${response.status}`
		throw new Error(`users-count failed: ${message}`)
	}

	return {
		totalUsers: Number(payload.totalUsers || 0),
		totalActiveUsers: Number(payload.totalActiveUsers || 0),
	}
}

async function publishUsersCountNews(now) {
	const counts = await fetchUsersCount()
	await publishNews({
		tipo: 'system',
		eventType: 'system.total_users',
		dedupeKey: `system.total_users:${isoDate(now)}`,
		titulo: 'Atualizacao de utilizadores da plataforma',
		conteudo: `O sistema tem agora ${counts.totalActiveUsers} utilizadores ativos (${counts.totalUsers} no total).`,
		createdBy: 'system',
		payload: {
			generatedAt: now.toISOString(),
			totalUsers: counts.totalUsers,
			totalActiveUsers: counts.totalActiveUsers,
		},
	})
}

async function runDailySystemNewsJob() {
	const now = new Date()
	try {
		await publishTop3News(now)
	} catch (err) {
		console.error('[api][system-news] top3 job failed:', err)
	}

	try {
		await publishUsersCountNews(now)
	} catch (err) {
		console.error('[api][system-news] users-count job failed:', err)
	}
}

function startSystemNewsJob() {
	const firstRunAt = nextRunAt(config.newsJobs.dailyHour, config.newsJobs.dailyMinute)
	const initialDelay = Math.max(1000, firstRunAt.getTime() - Date.now())

	setTimeout(() => {
		runDailySystemNewsJob()
		setInterval(runDailySystemNewsJob, DAY_MS)
	}, initialDelay)

	setTimeout(() => {
		runDailySystemNewsJob()
	}, 15_000)

	console.log(
		`[api][system-news] scheduled daily run at ${String(config.newsJobs.dailyHour).padStart(2, '0')}:${String(config.newsJobs.dailyMinute).padStart(2, '0')}`
	)
}

module.exports = {
	startSystemNewsJob,
	runDailySystemNewsJob,
}
