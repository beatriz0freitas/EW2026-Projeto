const express = require('express')

const Aip = require('../../models/Aip')
const Resource = require('../../models/Resource')
const { construirDipZip } = require('./dip')
const { optionalAuth } = require('../../middleware/auth')
const { config } = require('../../lib/config')
const { jsonError, isMongoId } = require('../../lib/http')
const { publishTop3NewsIfChanged } = require('../../jobs/systemNews')

const router = express.Router()

// GET /api/oais/access/:id
// - recurso público  → qualquer pessoa (autenticada ou não) pode descarregar
// - recurso privado  → só o produtor que submeteu ou um admin
router.get('/access/:id', optionalAuth, async (req, res) => {
	const aipDir = config.storage.aipDir

	if (!isMongoId(req.params.id)) {
		return jsonError(res, 400, { code: 'INVALID_ID', message: 'id inválido' })
	}

	// 1) Buscar registo no Mongo
	let resource
	try {
		resource = await Resource.findById(req.params.id)
	} catch {
		return jsonError(res, 400, { code: 'INVALID_ID', message: 'id inválido' })
	}
	if (!resource) {
		return jsonError(res, 404, { code: 'RESOURCE_NOT_FOUND', message: 'recurso não encontrado' })
	}

	// 2) Verificar visibilidade
	const visibilidade = resource.metadata?.resource?.visibilidade || 'privado'

	if (visibilidade === 'privado') {
		if (!req.user) {
			return jsonError(res, 401, {
				code: 'AUTH_REQUIRED',
				message: 'autenticação necessária para recursos privados',
			})
		}
		const isAdmin = req.user.role === 'admin'
		const isOwner = String(resource.produtor) === String(req.user.sub)
		if (!isAdmin && !isOwner) {
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'acesso negado' })
		}
	}

	// 3) Converter o AIP preservado num DIP amigável em ZIP
	const selecaoManual = req.query.selection === 'manual'
	const dip = await construirDipZip({
		resource,
		aipDir,
		selecionados: selecaoManual ? (req.query.file || []) : req.query.file,
	})
	if (!dip) {
		return jsonError(res, 404, {
			code: 'AIP_FILE_NOT_FOUND',
			message: 'ficheiro AIP não encontrado em disco',
		})
	}

	const filename = dip.filename
	res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
	res.setHeader('Content-Type', 'application/zip')
	res.setHeader('Content-Length', String(dip.buffer.length))

	try {
		await Resource.updateOne({ _id: resource._id }, { $inc: { downloadCount: 1 } })
		await Aip.updateOne({ recursoId: resource._id, status: 'ok' }, { $inc: { downloadCount: 1 } })
		publishTop3NewsIfChanged().catch((err) => {
			console.error('[api][access] warning: could not publish top3 news after download:', err)
		})
	} catch (err) {
		console.error('[api][access] warning: could not increment downloadCount:', err)
	}

	res.send(dip.buffer)
})

module.exports = router
