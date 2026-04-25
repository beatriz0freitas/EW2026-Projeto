const Taxonomy = require('../models/Taxonomy')
const { jsonError, invalidId, isMongoId } = require('../lib/http')

module.exports.list = async (req, res) => {
	try {
		const items = await Taxonomy.find().sort({ tipo: 1, ano: 1, tema: 1, hashtag: 1 })
		res.json({ ok: true, items })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.create = async (req, res) => {
	try {
		const { tipo, ano, tema, hashtag } = req.body
		if (!tipo) {
			return jsonError(res, 400, 'campo tipo é obrigatório')
		}

		const item = await Taxonomy.create({ tipo, ano, tema, hashtag })
		res.status(201).json({ ok: true, item })
	} catch (err) {
		if (err.code === 11000) {
			return jsonError(res, 409, 'item de taxonomia já existe')
		}
		jsonError(res, 500, 'erro interno')
	}
}

module.exports.deleteById = async (req, res) => {
	if (!isMongoId(req.params.id)) return invalidId(res)

	try {
		const item = await Taxonomy.findByIdAndDelete(req.params.id)
		if (!item) return jsonError(res, 404, 'item não encontrado')

		res.json({ ok: true })
	} catch {
		jsonError(res, 500, 'erro interno')
	}
}
