const express = require('express')
const path = require('path')

const Resource = require('../../models/Resource')
const { getDipZipPath } = require('./dip')
const { optionalAuth } = require('../../middleware/auth')
const { jsonError, isMongoId } = require('../../lib/http')

const router = express.Router()

// GET /api/oais/access/:id
// - recurso público  → qualquer pessoa (autenticada ou não) pode descarregar
// - recurso privado  → só o produtor que submeteu ou um admin
router.get('/access/:id', optionalAuth, async (req, res) => {
	const aipDir = process.env.AIP_DIR || '/aip'

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
		const isAdmin = req.user.nivel === 'admin'
		const isOwner = String(resource.produtor) === String(req.user.sub)
		if (!isAdmin && !isOwner) {
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'acesso negado' })
		}
	}

	// 3) Devolver o ZIP (DIP = SIP)
	const zipPath = await getDipZipPath({ resourceId: req.params.id, aipDir })
	if (!zipPath) {
		return jsonError(res, 404, {
			code: 'AIP_FILE_NOT_FOUND',
			message: 'ficheiro AIP não encontrado em disco',
		})
	}

	const filename = `resource-${req.params.id}.zip`
	res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
	res.setHeader('Content-Type', 'application/zip')
	res.sendFile(path.resolve(zipPath))
})

module.exports = router