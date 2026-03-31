const express = require('express')
const multer = require('multer')

const { ingestSipZip } = require('./sip')
const { requireLevel } = require('../../middleware/auth')

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
			return res.status(400).json({ ok: false, errors: [{ code: 'MISSING_FILE', message: 'Ficheiro SIP (ZIP) em falta' }] })
		}

		const aipDir = process.env.AIP_DIR || '/aip'

		// Injetar o produtor no resultado para ser guardado pelo sip.js
		const result = await ingestSipZip({
			zipBuffer: req.file.buffer,
			aipDir,
			producerId: req.user.sub,
		})

		if (!result.ok) {
			return res.status(422).json({ ok: false, errors: result.errors })
		}

		res.status(201).json({ ok: true, resourceId: result.resourceId })
	}
)

module.exports = router