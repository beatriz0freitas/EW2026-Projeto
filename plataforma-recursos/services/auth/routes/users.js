const express = require('express')
const router = express.Router()

const User = require('../controllers/user')
const auth = require('../auth/auth')
const { jsonError } = require('../lib/http')
const { buildAuthCookieOptions } = require('../lib/jwt')
const { config } = require('../lib/config')

async function handleRegister(req, res) {
	try {
		const user = await User.insert(req.body)

		res.status(201).json({ ok: true, user })
	} catch (err) {
		const msg = String(err?.message || '').toLowerCase()
		if (msg.includes('email') && msg.includes('registado')) {
			return jsonError(res, 409, { code: 'DUPLICATE_EMAIL', message: 'email ja registado' })
		}
		if (msg.includes('obrigatorios') || msg.includes('password')) {
			return jsonError(res, 400, { code: 'INVALID_INPUT', message: err.message })
		}
		console.error('[auth] register error:', err)
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}

async function handleLogin(req, res) {
	try {
		const { username, email, password } = req.body
		const identifier = username || email
		const dados = await User.login(identifier, password)

		res.cookie(config.cookies.name, dados.token, buildAuthCookieOptions())

		res.json({ ok: true, token: dados.token, user: dados.user })
	} catch (err) {
		const msg = String(err?.message || '').toLowerCase()
		if (msg.includes('desativada')) {
			return jsonError(res, 403, { code: 'ACCOUNT_DISABLED', message: 'conta desativada' })
		}
		if (msg.includes('nao encontrado') || msg.includes('incorreta') || msg.includes('invalidas')) {
			return jsonError(res, 401, { code: 'INVALID_CREDENTIALS', message: 'credenciais invalidas' })
		}
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
}

function handleLogout(req, res) {
	res.clearCookie(config.cookies.name, {
		domain: config.cookies.domain,
		path: config.cookies.path,
	})
	res.json({ ok: true })
}

// POST /auth/register
router.post('/register', handleRegister)

// Compatibilidade com o padrao de myAuth:
// POST /auth/users, /auth/login e /auth/users/login
router.post('/users', handleRegister)
router.post('/login', handleLogin)
router.post('/users/login', handleLogin)

// GET /auth/logout e /auth/users/logout
router.get('/logout', handleLogout)
router.get('/users/logout', handleLogout)

// GET /auth/users  (admin: lista todos os utilizadores)
router.get('/users', auth.verificaAcesso, auth.requireAdmin, async (req, res) => {
	try {
		const users = await User.list()
		res.json({ ok: true, users })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// GET /auth/users/:id  (admin ou proprio utilizador)
router.get('/users/:id', auth.verificaAcesso, async (req, res) => {
	try {
		const canAccess = req.user.nivel === 'admin' || String(req.user.sub) === String(req.params.id)
		if (!canAccess) {
			return jsonError(res, 403, { code: 'FORBIDDEN', message: 'permissoes insuficientes' })
		}

		const user = await User.findById(req.params.id)
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador nao encontrado' })

		res.json({ ok: true, user })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// PATCH /auth/users/:id  (admin: atualizar nivel ou dados)
router.patch('/users/:id', auth.verificaAcesso, auth.requireAdmin, async (req, res) => {
	try {
		const user = await User.update(req.params.id, req.body)
		if (!user) return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador nao encontrado' })
		res.json({ ok: true, user })
	} catch (err) {
		if (String(err?.message || '').toLowerCase().includes('invalido')) {
			return jsonError(res, 400, { code: 'INVALID_LEVEL', message: err.message })
		}
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

// DELETE /auth/users/:id  (admin: desativa utilizador)
router.delete('/users/:id', auth.verificaAcesso, auth.requireAdmin, async (req, res) => {
	try {
		if (String(req.user.sub) === String(req.params.id)) {
			return jsonError(res, 400, {
				code: 'SELF_DELETE_FORBIDDEN',
				message: 'nao podes desativar o teu proprio utilizador',
			})
		}

		const user = await User.remove(req.params.id)
		if (!user) {
			return jsonError(res, 404, { code: 'USER_NOT_FOUND', message: 'utilizador nao encontrado' })
		}

		res.json({ ok: true, user })
	} catch (err) {
		jsonError(res, 500, { code: 'INTERNAL_ERROR', message: 'erro interno' })
	}
})

module.exports = router