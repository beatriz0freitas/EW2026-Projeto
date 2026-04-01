const mongoose = require('mongoose')

const PostSchema = new mongoose.Schema(
	{
		titulo: { type: String, required: true, trim: true, maxlength: 160 },
		conteudo: { type: String, required: true, trim: true, maxlength: 20000 },
		resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', default: null },
		autorId: { type: String, required: true },
		autorNome: { type: String, default: '' },
		createdAt: { type: Date, default: () => new Date() },
		updatedAt: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

PostSchema.pre('save', function (next) {
	this.updatedAt = new Date()
	next()
})

module.exports = mongoose.model('Post', PostSchema)

