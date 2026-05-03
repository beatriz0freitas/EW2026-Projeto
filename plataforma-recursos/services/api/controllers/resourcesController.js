const fsp = require('fs/promises')
const Resource = require('../models/Resource')
const Post = require('../models/Post')
const Rating = require('../models/Rating')
const Comment = require('../models/Comment')
const { config } = require('../lib/config')
const { validateMetadataResource } = require('../lib/metadataValidator')
const { resolveResourceAipPath } = require('../lib/aipStorage')
const { getPagination, totalPages, jsonError, invalidId, isMongoId } = require('../lib/http')
const { canViewResource, visibilityQuery } = require('../lib/resourceAccess')

function buildFilters(query) {
	const filters = {}
	if (query.tipo) filters['metadata.resource.tipo'] = query.tipo
	if (query.ano) filters['metadata.resource.ano'] = Number(query.ano)
	if (query.tema) filters['metadata.resource.tema'] = query.tema
	if (query.hashtag) filters['metadata.resource.hashtags'] = query.hashtag
	return filters
}

function canManageResource(resource, user) {
	if (!user) return false
	if (user.role === 'admin') return true
	return String(resource.produtor) === String(user.sub)
}

function limparTexto(valor) {
	return String(valor || '').trim()
}

function normalizarHashtags(valor) {
	if (Array.isArray(valor)) {
		return valor.map((item) => limparTexto(item)).filter(Boolean)
	}
	return limparTexto(valor)
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
}

function construirMetadataAtualizada(metadataAtual, metadataRecebida) {
	const origem = metadataRecebida?.resource && typeof metadataRecebida.resource === 'object'
		? metadataRecebida.resource
		: metadataRecebida

	if (!origem || typeof origem !== 'object' || Array.isArray(origem)) {
		return {
			ok: false,
			errors: [{ code: 'BAD_METADATA', message: 'metadata.resource deve ser um objeto' }],
		}
	}

	const metadataBase = metadataAtual && typeof metadataAtual === 'object' && !Array.isArray(metadataAtual)
		? metadataAtual
		: {}
	const resourceBase = metadataBase.resource && typeof metadataBase.resource === 'object'
		? metadataBase.resource
		: {}
	const resource = { ...resourceBase }
	const camposTexto = ['tipo', 'titulo', 'subtitulo', 'tema', 'dataCriacao', 'descricao']

	for (const campo of camposTexto) {
		if (Object.prototype.hasOwnProperty.call(origem, campo)) {
			const valor = limparTexto(origem[campo])
			if (valor) resource[campo] = valor
			else if (['subtitulo', 'tema', 'dataCriacao', 'descricao'].includes(campo)) delete resource[campo]
			else resource[campo] = ''
		}
	}

	if (Object.prototype.hasOwnProperty.call(origem, 'ano')) {
		const anoTexto = limparTexto(origem.ano)
		if (!anoTexto) {
			delete resource.ano
		} else {
			const ano = Number(anoTexto)
			if (Number.isInteger(ano)) {
				resource.ano = ano
			} else {
				resource.ano = origem.ano 
			}
		}
	}

	if (Object.prototype.hasOwnProperty.call(origem, 'visibilidade')) {
		resource.visibilidade = origem.visibilidade
	}

	if (Object.prototype.hasOwnProperty.call(origem, 'hashtags')) {
		const hashtags = normalizarHashtags(origem.hashtags)
		if (hashtags.length) resource.hashtags = hashtags
		else delete resource.hashtags
	}

	const validation = validateMetadataResource(resource)
	if (!validation.ok) {
		return validation
	}

	return {
		ok: true,
		metadata: {
			...metadataBase,
			resource,
		},
	}
}

module.exports.list = async (req, res) => {
	try {
		const { page, limit, skip } = getPagination(req.query)
		const filters = { ...buildFilters(req.query), ...visibilityQuery(req.user) }
		const [items, total] = await Promise.all([
			Resource.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
			Resource.countDocuments(filters),
		])
		res.json({ ok: true, page, limit, total, totalPages: totalPages(total, limit), items })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.getById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return jsonError(res, 404, 'recurso não encontrado')
		if (!canViewResource(resource, req.user)) {
			const visibilidade = resource?.metadata?.resource?.visibilidade || 'privado'
			if (visibilidade === 'privado' && !req.user) {
				return jsonError(res, 401, { code: 'AUTH_REQUIRED', message: 'autenticação necessária para recursos privados' })
			}
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'acesso negado' })
		}
		res.json({ ok: true, resource })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.patchById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return jsonError(res, 404, 'recurso não encontrado')
		if (!canManageResource(resource, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}
		if (req.body.metadata && typeof req.body.metadata === 'object') {
			const resultado = construirMetadataAtualizada(resource.metadata, req.body.metadata)
			if (!resultado.ok) {
				return jsonError(res, 400, {
					code: 'BAD_METADATA',
					message: 'metadados inválidos',
					details: resultado.errors,
				})
			}
			resource.metadata = resultado.metadata
		}
		await resource.save()
		res.json({ ok: true, resource })
	} catch {
		jsonError(res, 400, 'pedido inválido')
	}
}

module.exports.deleteById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)
	try {
		const resource = await Resource.findById(req.params.id)
		if (!resource) return jsonError(res, 404, 'recurso não encontrado')
		if (!canManageResource(resource, req.user)) {
			return jsonError(res, 403, 'acesso negado')
		}

		const resourceDir = resolveResourceAipPath(resource, config.storage.aipDir)
		try {
			await fsp.rm(resourceDir, { recursive: true, force: true })
		} catch (fsErr) {
			console.error(`[resources] erro: não foi possível apagar AIP em disco: ${resourceDir}`, fsErr)
			return jsonError(res, 500, {
				code: 'AIP_DELETE_FAILED',
				message: 'não foi possível apagar o recurso em disco',
			})
		}

		const posts = await Post.find({ resourceId: resource._id }).select('_id').lean()
		const postIds = posts.map((post) => post._id)

		await Promise.all([
			Resource.deleteOne({ _id: resource._id }),
			Rating.deleteMany({ resourceId: resource._id }),
			Post.deleteMany({ resourceId: resource._id }),
			postIds.length ? Comment.deleteMany({ postId: { $in: postIds } }) : Promise.resolve(),
		])

		res.json({ ok: true })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
