const mongoose = require('mongoose')

const ResourceSchema = new mongoose.Schema(
	{
		metadata: { type: Object, required: true },
		aipPath: { type: String, required: true },
		// ID do utilizador que submeteu (string do _id do User no serviço auth)
		produtor: { type: String, default: null },
		downloadCount: { type: Number, default: 0, min: 0, index: true },
		createdAt: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

module.exports = mongoose.model('Resource', ResourceSchema)