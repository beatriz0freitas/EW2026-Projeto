const express = require('express')
const multer = require('multer')

const { ingestSipZip } = require('./sip')
const { requireLevel } = require('../../middleware/auth')
const { jsonError } = require('../../lib/http')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

// POST /api/oais/ingest
// Só produtores e admins podem submeter recursos.
// O produtor fica registado no metadata guardado.
router.post(
	'/ingest',
	requireLevel('produtor'),
	upload.single('sip'),
	async (req, res) => {
		if (!req.file) {
			return jsonError(res, 400, {
				code: 'MISSING_FILE',
				message: 'Ficheiro SIP (ZIP) em falta',
				details: [{ code: 'MISSING_FILE', message: 'Ficheiro SIP (ZIP) em falta' }],
			})
		}

		const aipDir = process.env.AIP_DIR || '/aip'

		// Injetar o produtor no resultado para ser guardado pelo sip.js
		const result = await ingestSipZip({
			zipBuffer: req.file.buffer,
			aipDir,
			producerId: req.user.sub,
		})

		if (!result.ok) {
			return jsonError(res, 422, {
				code: 'INVALID_SIP',
				message: 'SIP inválido',
				details: result.errors,
			})
		}

		res.status(201).json({ ok: true, resourceId: result.resourceId })
	}
)

module.exports = router