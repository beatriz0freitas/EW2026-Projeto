const mongoose = require('mongoose')

const RatingSchema = new mongoose.Schema(
	{
		resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
		userId: { type: String, required: true, index: true },
		stars: { type: Number, required: true, min: 1, max: 5 },
		createdAt: { type: Date, default: () => new Date() },
		updatedAt: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

RatingSchema.index({ resourceId: 1, userId: 1 }, { unique: true })

RatingSchema.pre('save', function (next) {
	this.updatedAt = new Date()
	next()
})

module.exports = mongoose.model('Rating', RatingSchema)

