const mongoose = require('mongoose')

const ResourceSchema = new mongoose.Schema(
	{
		metadata: { type: Object, required: true },
		aipPath: { type: String, required: true },
		createdAt: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

module.exports = mongoose.model('Resource', ResourceSchema)

