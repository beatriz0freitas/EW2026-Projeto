const bcrypt = require('bcrypt')
const User = require('../models/User')
const { signAccessToken } = require('../lib/jwt')

const ROLES = ['admin', 'produtor', 'consumidor']

function normalizeRole(input) {
	if (!input) return 'consumidor'
	const value = String(input).trim().toLowerCase()
	if (value === 'gestor') return 'produtor'
	if (!ROLES.includes(value)) throw new Error('role invalido')
	return value
}

function normalizeFiliacao(input) {
	if (input === undefined || input === null) return ''
	if (typeof input === 'string') return input.trim()
	if (typeof input === 'object') {
		if (input.instituicao) return String(input.instituicao).trim()
		if (input.departamento) return String(input.departamento).trim()
		if (input.curso) return String(input.curso).trim()
	}
	return String(input).trim()
}

function toPublicUser(userDoc) {
	return userDoc ? userDoc.toJSON() : null
}

async function generateUserId(rawInputId, email) {
	let base = rawInputId
		? String(rawInputId).trim()
		: String(email || '').split('@')[0].trim()

	base = base.toLowerCase().replace(/[^a-z0-9._-]/g, '')
	if (!base) base = 'user'

	let candidate = base
	let counter = 2
	while (await User.exists({ _id: candidate })) {
		candidate = `${base}-${counter}`
		counter++
	}
	return candidate
}

module.exports.list = () =>
	User.find({ ativo: true }, { password: 0 }).sort({ nome: 1 }).exec()

module.exports.findById = (id) =>
	User.findOne({ _id: id, ativo: true }, { password: 0 }).exec()

module.exports.insert = async (input, options = {}) => {
	const isPublicRegistration = options.publicRegistration === true
	const nome = String(input?.nome || '').trim()
	const email = String(input?.email || '').trim().toLowerCase()
	const password = String(input?.password || '')

	if (!nome || !email || !password) throw new Error('nome, email e password sao obrigatorios')
	if (password.length < 6) throw new Error('password deve ter pelo menos 6 caracteres')

	if (await User.findOne({ email })) throw new Error('email ja registado')

	const _id = await generateUserId(input?._id || input?.username, email)
	const role = isPublicRegistration ? 'consumidor' : normalizeRole(input?.role)
	const nivelAcesso = isPublicRegistration
		? undefined
		: Number.isFinite(Number(input?.nivel_acesso))
			? Number(input.nivel_acesso)
			: undefined

	const user = new User({
		_id,
		nome,
		email,
		password,
		role,
		filiacao: normalizeFiliacao(input?.filiacao),
		nivel_acesso: nivelAcesso,
		ativo: input?.ativo === undefined ? true : Boolean(input.ativo),
	})

	await user.save()
	return toPublicUser(user)
}

module.exports.update = async (id, input) => {
	const update = {}

	if (input?.nome !== undefined) update.nome = String(input.nome).trim()
	if (input?.email !== undefined) update.email = String(input.email).trim().toLowerCase()
	if (input?.filiacao !== undefined) update.filiacao = normalizeFiliacao(input.filiacao)
	if (input?.role !== undefined) update.role = normalizeRole(input.role)
	if (input?.nivel_acesso !== undefined) update.nivel_acesso = Number(input.nivel_acesso)
	if (input?.ativo !== undefined) update.ativo = Boolean(input.ativo)
	if (input?.password) update.password = await bcrypt.hash(String(input.password), 10)

	const user = await User.findByIdAndUpdate(id, update, {
		new: true,
		runValidators: false,
		projection: { password: 0 },
	})
	return toPublicUser(user)
}

module.exports.remove = async (id) => {
	const user = await User.findById(id)
	if (!user) return null

	const ts = Date.now()
	const update = {
		ativo: false,
		email: `del_${ts}_${user.email}`
	}

	if (user.googleId) update.googleId = `del_${ts}_${user.googleId}`
	if (user.facebookId) update.facebookId = `del_${ts}_${user.facebookId}`

	const updatedUser = await User.findByIdAndUpdate(
		id,
		update,
		{ new: true, runValidators: false, projection: { password: 0 } }
	)
	return toPublicUser(updatedUser)
}

module.exports.getStats = async () => {
	const [totalUsers, totalActiveUsers] = await Promise.all([
		User.countDocuments({}),
		User.countDocuments({ ativo: true }),
	])

	return { totalUsers, totalActiveUsers }
}

module.exports.exportForTransfer = () =>
	User.find({}).sort({ nome: 1 }).lean().exec()

module.exports.importForTransfer = async (users) => {
	const results = { upserted: 0, errors: [] }
	if (!Array.isArray(users)) return results

	const allowedUpdateFields = [
		'nome',
		'email',
		'password',
		'googleId',
		'facebookId',
		'role',
		'filiacao',
		'nivel_acesso',
		'data_registo',
		'ultimo_acesso',
		'ativo',
	]

	for (const user of users) {
		try {
			if (!user?._id) throw new Error('utilizador sem _id')

			const nextUser = {}
			for (const field of allowedUpdateFields) {
				if (user[field] !== undefined) nextUser[field] = user[field]
			}

			await User.findByIdAndUpdate(
				user._id,
				{ $set: nextUser },
				{ upsert: true, new: true, runValidators: false }
			)
			results.upserted++
		} catch (err) {
			results.errors.push({ id: String(user?._id || ''), message: err.message })
		}
	}

	return results
}

module.exports.login = async (identifier, password) => {
	const lookup = String(identifier || '').trim()
	if (!lookup || !password) throw new Error('credenciais invalidas')

	const user = await User.findOne({
		$or: [{ _id: lookup }, { email: lookup.toLowerCase() }],
	})

	if (!user) throw new Error('utilizador nao encontrado')
	if (!user.ativo) throw new Error('conta desativada')
	if (!(await user.checkPassword(String(password)))) throw new Error('password incorreta')

	await User.updateOne({ _id: user._id }, { ultimo_acesso: new Date() })

	return { token: signAccessToken(user), user: toPublicUser(user) }
}

module.exports.oauthLogin = async (provider, providerId, email, nome) => {
	email = String(email).trim().toLowerCase()
	if (!email) throw new Error('email é obrigatorio')

	const searchField = provider === 'google' ? 'googleId' : 'facebookId'
	let user = await User.findOne({
		$or: [{ [searchField]: providerId }, { email: email }],
	})
	
	let isNew = false

	if (user) {
		if (!user.ativo) throw new Error('conta desativada')
		if (!user[searchField]) {
			user[searchField] = providerId
			await user.save()
		}
	} else {
		const _id = await generateUserId(null, email)
		user = new User({
			_id,
			nome,
			email,
			role: 'consumidor',
			[searchField]: providerId,
		})
		await user.save()
		isNew = true
	}

	await User.updateOne({ _id: user._id }, { ultimo_acesso: new Date() })

	return { token: signAccessToken(user), user: toPublicUser(user), isNew }
}
