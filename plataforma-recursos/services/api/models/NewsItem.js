const mongoose = require('mongoose')

const NewsItemSchema = new mongoose.Schema(
	{
		titulo: { type: String, required: true, trim: true, maxlength: 160 },
		conteudo: { type: String, required: true, trim: true, maxlength: 10000 },
		publicadoEm: { type: Date, default: () => new Date(), index: true },
		createdBy: { type: String, required: true },
	},
	{ versionKey: false }
)

module.exports = mongoose.model('NewsItem', NewsItemSchema)

