const express = require('express')

const { authRequest } = require('../lib/http')

const router = express.Router()

router.get('/login', (req, res) => {
	if (req.session.token) {
		return res.redirect('/')
	}

	res.render('auth/login', {
		title: 'Entrar',
	})
})

router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body
		const login = await authRequest('/sessions', {
			method: 'POST',
			body: { email, password },
		})

		if (!login.ok || !login.data?.token) {
			req.flashError(login.data?.error || 'Não foi possível iniciar sessão.')
			return res.redirect('/auth/login')
		}

		req.session.token = login.data.token
		req.session.user = login.data.user
		req.flashSuccess('Sessão iniciada com sucesso.')
		res.redirect('/')
	} catch (err) {
		req.flashError('Erro inesperado ao iniciar sessão.')
		res.redirect('/auth/login')
	}
})

router.get('/register', (req, res) => {
	if (req.session.token) {
		return res.redirect('/')
	}

	res.render('auth/register', {
		title: 'Registar',
	})
})

router.post('/register', async (req, res) => {
	try {
		const { nome, email, password, filiacao } = req.body

		const register = await authRequest('/register', {
			method: 'POST',
			body: {
				nome,
				email,
				password,
				filiacao: filiacao ? { instituicao: filiacao } : {},
			},
		})

		if (!register.ok) {
			req.flashError(register.data?.error || 'Não foi possível concluir o registo.')
			return res.redirect('/auth/register')
		}

		req.flashSuccess('Registo concluído. Agora pode entrar.')
		res.redirect('/auth/login')
	} catch (err) {
		req.flashError('Erro inesperado no registo.')
		res.redirect('/auth/register')
	}
})

function clearSession(req, res) {
	req.session.destroy(() => {
		res.clearCookie('ew.sid')
		res.redirect('/auth/login')
	})
}

router.get('/logout', clearSession)
router.post('/logout', clearSession)

module.exports = router

