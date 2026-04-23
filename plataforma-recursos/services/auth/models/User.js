const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const ROLES = ['admin', 'produtor', 'consumidor']

const UserSchema = new mongoose.Schema(
	{
		_id: {
			type: String,
			required: true,
			trim: true,
			description: 'Username ou ID unico do utilizador',
		},
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
		nivel: { type: String, enum: ROLES },
		filiacao: { type: String, default: '' },
		nivel_acesso: { type: Number, default: 1, min: 1, max: 10 },
		data_registo: { type: Date, default: Date.now },
		ultimo_acesso: { type: Date },
		ativo: { type: Boolean, default: true },
	},
	{ versionKey: false }
)

// Hash da password antes de guardar
UserSchema.pre('save', async function (next) {
	if (!this.role && this.nivel) this.role = this.nivel
	if (this.role) this.nivel = this.role

	if (!this.isModified('password')) return next()
	this.password = await bcrypt.hash(this.password, 10)
	next()
})

// Comparar password em texto simples com o hash guardado
UserSchema.methods.checkPassword = function (plain) {
	return bcrypt.compare(plain, this.password)
}

// Nunca devolver a password em JSON
UserSchema.methods.toJSON = function () {
	const obj = this.toObject()
	delete obj.password
	obj.nivel = obj.role || obj.nivel || 'consumidor'
	obj.role = obj.nivel
	return obj
}

module.exports = mongoose.model('User', UserSchema)