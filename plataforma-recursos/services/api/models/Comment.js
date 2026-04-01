const mongoose = require('mongoose')

const CommentSchema = new mongoose.Schema(
	{
		postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
		autorId: { type: String, required: true },
		autorNome: { type: String, default: '' },
		texto: { type: String, required: true, trim: true, maxlength: 5000 },
		createdAt: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

module.exports = mongoose.model('Comment', CommentSchema)

