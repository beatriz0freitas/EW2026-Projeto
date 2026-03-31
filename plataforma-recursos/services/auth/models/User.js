const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const NIVEIS = ['admin', 'produtor', 'consumidor']

const UserSchema = new mongoose.Schema(
	{
		nome: { type: String, required: true, trim: true },
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		password: { type: String, required: true },
		nivel: { type: String, enum: NIVEIS, default: 'consumidor' },
		filiacao: {
			tipo: { type: String, enum: ['estudante', 'docente', 'outro'], default: 'estudante' },
			curso: { type: String, default: '' },
			departamento: { type: String, default: '' },
		},
		dataRegisto: { type: Date, default: () => new Date() },
		dataUltimoAcesso: { type: Date, default: () => new Date() },
	},
	{ versionKey: false }
)

// Hash da password antes de guardar
UserSchema.pre('save', async function (next) {
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
	return obj
}

module.exports = mongoose.model('User', UserSchema)