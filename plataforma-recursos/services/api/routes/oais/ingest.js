const express = require('express')
const multer = require('multer')

const { ingestSipZip } = require('../../oais/ingest/sip')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } })

router.post('/ingest', upload.single('sip'), async (req, res) => {
	try {
		if (!req.file || !req.file.buffer) {
			return res.status(400).json({ errors: [{ code: 'MISSING_FILE', message: "Expected multipart field 'sip' (zip)" }] })
		}

		const aipDir = process.env.AIP_DIR || '/aip'
		const result = await ingestSipZip({ zipBuffer: req.file.buffer, aipDir })

		if (!result.ok) {
			return res.status(400).json({ ok: false, errors: result.errors })
		}

		return res.status(201).json({ ok: true, resourceId: result.resourceId })
	} catch (err) {
		return res.status(500).json({ ok: false, errors: [{ code: 'INTERNAL', message: err.message }] })
	}
})

module.exports = router

