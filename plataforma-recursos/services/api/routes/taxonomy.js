const express = require('express')

const Taxonomy = require('../models/Taxonomy')
const { requireLevel } = require('../middleware/auth')

const router = express.Router()

// GET /api/taxonomy
router.get('/', async (req, res) => {
	try {
		const items = await Taxonomy.find().sort({ tipo: 1, ano: 1, tema: 1, hashtag: 1 })
		res.json({ ok: true, items })
	} catch (err) {
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// POST /api/taxonomy (admin)
router.post('/', requireLevel('admin'), async (req, res) => {
	try {
		const { tipo, ano, tema, hashtag } = req.body
		if (!tipo) {
			return res.status(400).json({ ok: false, error: 'campo tipo é obrigatório' })
		}

		const item = await Taxonomy.create({ tipo, ano, tema, hashtag })
		res.status(201).json({ ok: true, item })
	} catch (err) {
		if (err.code === 11000) {
			return res.status(409).json({ ok: false, error: 'item de taxonomia já existe' })
		}
		res.status(500).json({ ok: false, error: 'erro interno' })
	}
})

// DELETE /api/taxonomy/:id (admin)
router.delete('/:id', requireLevel('admin'), async (req, res) => {
	try {
		const item = await Taxonomy.findByIdAndDelete(req.params.id)
		if (!item) return res.status(404).json({ ok: false, error: 'item não encontrado' })

		res.json({ ok: true })
	} catch (err) {
		res.status(400).json({ ok: false, error: 'id inválido' })
	}
})

module.exports = router

