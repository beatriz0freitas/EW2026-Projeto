const mongoose = require('mongoose')

const TaxonomySchema = new mongoose.Schema(
	{
		tipo: { type: String, required: true, trim: true },
		ano: { type: Number, default: null },
		tema: { type: String, default: '', trim: true },
		hashtag: { type: String, default: '', trim: true },
		createdAt: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

TaxonomySchema.index({ tipo: 1, ano: 1, tema: 1, hashtag: 1 }, { unique: true })

module.exports = mongoose.model('Taxonomy', TaxonomySchema)

