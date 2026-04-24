const path = require('path')
const express = require('express')
const session = require('express-session')
const { config } = require('./lib/config')

const indexRouter = require('./routes/index')
const authRouter = require('./routes/auth')
const resourcesRouter = require('./routes/resources')
const postsRouter = require('./routes/posts')
const adminRouter = require('./routes/admin')

const app = express()

app.set('view engine', 'pug')
app.set('views', path.join(__dirname, 'views'))

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

app.use(
	session({
		name: config.session.cookieName,
		secret: config.session.secret,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			sameSite: 'lax',
			secure: config.nodeEnv === 'production',
			maxAge: 1000 * 60 * 60 * 24,
		},
	})
)

app.use((req, res, next) => {
	res.locals.user = req.session.user || null
	res.locals.success = req.session.success || null
	res.locals.error = req.session.error || null

	req.flashSuccess = (message) => {
		req.session.success = message
	}
	req.flashError = (message) => {
		req.session.error = message
	}

	delete req.session.success
	delete req.session.error
	next()
})

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.use('/', indexRouter)
app.use('/auth', authRouter)
app.use('/resources', resourcesRouter)
app.use('/posts', postsRouter)
app.use('/admin', adminRouter)

app.use((req, res) => {
	res.status(404).render('error', {
		title: 'Página não encontrada',
		message: 'A página pedida não existe.',
	})
})

app.use((err, req, res, next) => {
	console.error('[interface] unexpected error:', err)
	res.status(500).render('error', {
		title: 'Erro interno',
		message: 'Ocorreu um erro inesperado. Tente novamente.',
	})
})

app.listen(config.port, () => {
	console.log(`[interface] listening on :${config.port}`)
})

