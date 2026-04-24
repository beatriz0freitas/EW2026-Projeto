const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const ROLES = ['admin', 'produtor', 'consumidor']

const UserSchema = new mongoose.Schema(
	{
		_id: { type: String, required: true, trim: true },
		nome: { type: String, required: true, trim: true },
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
			match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email invalido'],
		},
		password: { type: String, required: true },
		role: { type: String, enum: ROLES, default: 'consumidor', required: true },
		filiacao: { type: String, default: '' },
		nivel_acesso: { type: Number, default: 1, min: 1, max: 10 },
		data_registo: { type: Date, default: Date.now },
		ultimo_acesso: { type: Date },
		ativo: { type: Boolean, default: true },
	},
	{ versionKey: false }
)

UserSchema.pre('save', async function (next) {
	if (!this.isModified('password')) return next()
	this.password = await bcrypt.hash(this.password, 10)
	next()
})

UserSchema.methods.checkPassword = function (plain) {
	return bcrypt.compare(plain, this.password)
}

UserSchema.methods.toJSON = function () {
	const obj = this.toObject()
	delete obj.password
	return obj
}

module.exports = mongoose.model('User', UserSchema)