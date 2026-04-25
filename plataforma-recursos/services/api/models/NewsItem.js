const mongoose = require('mongoose')

const NewsItemSchema = new mongoose.Schema(
	{
		titulo: { type: String, required: true, trim: true, maxlength: 160 },
		conteudo: { type: String, required: true, trim: true, maxlength: 10000 },
		tipo: { type: String, enum: ['manual', 'system'], default: 'manual', index: true },
		eventType: { type: String, default: null, index: true },
		dedupeKey: { type: String, default: undefined, trim: true },
		payload: { type: Object, default: null },
		publicadoEm: { type: Date, default: () => new Date(), index: true },
		createdBy: { type: String, required: true },
	},
	{ versionKey: false }
)

NewsItemSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true })

module.exports = mongoose.model('NewsItem', NewsItemSchema)

