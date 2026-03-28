const express = require('express')

const { getDipZipPath } = require('../../oais/access/dip')

const router = express.Router()

router.get('/access/:id', async (req, res) => {
	try {
		const aipDir = process.env.AIP_DIR || '/aip'
		const zipPath = await getDipZipPath({ resourceId: req.params.id, aipDir })
		if (!zipPath) {
			return res.status(404).json({ ok: false, errors: [{ code: 'NOT_FOUND', message: 'Resource not found' }] })
		}

		res.setHeader('Content-Type', 'application/zip')
		res.setHeader('Content-Disposition', `attachment; filename="DIP-${req.params.id}.zip"`)
		return res.sendFile(zipPath)
	} catch (err) {
		return res.status(500).json({ ok: false, errors: [{ code: 'INTERNAL', message: err.message }] })
	}
})

module.exports = router

