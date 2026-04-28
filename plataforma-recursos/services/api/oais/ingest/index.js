const express = require('express')

const { ingestSipZip } = require('./sip')
const Resource = require('../../models/Resource')
const { requireLevel } = require('../../middleware/auth')
const { config } = require('../../lib/config')
const { jsonError } = require('../../lib/http')
const { publishNews } = require('../../lib/newsPublisher')
const { publishTop3NewsIfChanged } = require('../../lib/systemNewsJob')
const { createSingleMemoryUpload } = require('../../lib/upload')

const router = express.Router()
const uploadSip = createSingleMemoryUpload({
	fieldName: 'sip',
	maxFileSizeBytes: config.oais.maxSipFileSizeBytes,
	allowedExtensions: ['.zip'],
	allowedMimeTypes: ['application/zip', 'application/x-zip-compressed'],
	errors: {
		fileTooLarge: {
			code: 'SIP_FILE_TOO_LARGE',
			message: 'ficheiro SIP excede o tamanho máximo suportado pela API',
		},
		fieldTooLarge: {
			code: 'SIP_FIELDS_TOO_LARGE',
			message: 'campos do pedido excedem o tamanho suportado pela API',
		},
		invalidType: {
			code: 'INVALID_SIP_FILE',
			message: 'o ficheiro SIP tem de ser um ZIP',
		},
	},
})

// POST /api/oais/ingest
// Só produtores e admins podem submeter recursos.
// O produtor fica registado no metadata guardado.
router.post(
	'/ingest',
	requireLevel('produtor'),
	uploadSip,
	async (req, res) => {
		if (!req.file) {
			return jsonError(res, 400, {
				code: 'MISSING_FILE',
				message: 'Ficheiro SIP (ZIP) em falta',
				details: [{ code: 'MISSING_FILE', message: 'Ficheiro SIP (ZIP) em falta' }],
			})
		}

		const aipDir = config.storage.aipDir

		// Injetar o produtor no resultado para ser guardado pelo sip.js
		const result = await ingestSipZip({
			zipBuffer: req.file.buffer,
			aipDir,
			producerId: req.user.sub,
			uploadedFile: {
				originalName: req.file.originalname,
				mimeType: req.file.mimetype,
				size: req.file.size,
			},
		})

		if (!result.ok) {
			return jsonError(res, 422, {
				code: 'INVALID_SIP',
				message: 'SIP inválido',
				details: result.errors,
			})
		}

		try {
			const resource = await Resource.findById(result.resourceId).lean()
			const titulo = resource?.metadata?.resource?.titulo || 'recurso sem titulo'
			const producerName = req.user?.nome || req.user?.sub || 'produtor'

			await publishNews({
				tipo: 'system',
				eventType: 'system.new_submission',
				dedupeKey: `system.new_submission:${result.resourceId}`,
				titulo: 'Nova submissao de recurso',
				conteudo: `${producerName} submeteu o recurso \"${titulo}\".`,
				createdBy: 'system',
				payload: {
					resourceId: result.resourceId,
					producerId: req.user?.sub || null,
					producerName: req.user?.nome || null,
					title: titulo,
				},
			})
		} catch (newsErr) {
			console.error('[api][ingest] warning: could not publish new submission news:', newsErr)
		}

		publishTop3NewsIfChanged().catch((err) => {
			console.error('[api][ingest] warning: could not publish top3 news after ingest:', err)
		})

		res.status(201).json({ ok: true, resourceId: result.resourceId })
	}
)

module.exports = router
