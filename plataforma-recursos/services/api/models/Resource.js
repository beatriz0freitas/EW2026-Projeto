const mongoose = require('mongoose')

const StoredAipFileSchema = new mongoose.Schema(
	{
		originalName: { type: String, required: true, trim: true },
		storageName: { type: String, required: true, trim: true },
		path: { type: String, required: true, trim: true },
		mimeType: { type: String, required: true, trim: true },
		size: { type: Number, required: true, min: 0 },
	},
	{ _id: false }
)

const ResourceSchema = new mongoose.Schema(
	{
		metadata: { type: Object, required: true },
		aipPath: { type: String, required: true, trim: true },
		aipFile: { type: StoredAipFileSchema, required: true },
		// ID do utilizador que submeteu (string do _id do User no serviço auth)
		produtor: { type: String, default: null },
		downloadCount: { type: Number, default: 0, min: 0, index: true },
		createdAt: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

module.exports = mongoose.model('Resource', ResourceSchema)
