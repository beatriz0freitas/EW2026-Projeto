const path = require('path')
const express = require('express')
const session = require('express-session')
const MongoStore = require('connect-mongo')
const helmet = require('helmet')
const passport = require('passport')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const { config } = require('./lib/config')

const indexRouter = require('./routes/index')
const authRouter = require('./routes/auth')
const resourcesRouter = require('./routes/resources')
const postsRouter = require('./routes/posts')
const adminRouter = require('./routes/admin')
const dataRouter = require('./routes/data')
const swaggerDocument = YAML.load('./swagger.yaml')

const app = express()

app.set('view engine', 'pug')
app.set('views', path.join(__dirname, 'views'))

app.use(helmet({
	contentSecurityPolicy: false,
	crossOriginEmbedderPolicy: false,
}))

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const sessionStore = MongoStore.create({
	mongoUrl: config.session.store.mongoUrl,
	collectionName: config.session.store.collectionName,
	ttl: config.session.ttlSeconds,
	autoRemove: 'native',
	stringify: false,
})

sessionStore.on('error', (err) => {
	console.error('[interface] erro na store de sessões MongoDB:', err)
})

app.use(
	session({
		name: config.session.cookieName,
		secret: config.session.secret,
		store: sessionStore,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			sameSite: 'lax',
			secure: config.nodeEnv === 'production',
			maxAge: config.session.ttlSeconds * 1000,
		},
	})
)

app.use(passport.initialize())

app.use((req, res, next) => {
	res.locals.user = req.session.user || null
	res.locals.success = req.session.success || null
	res.locals.error = req.session.error || null
	res.locals.currentPath = req.path || '/'
	res.locals.isActivePath = (href) => {
		if (href === '/') return res.locals.currentPath === '/'
		return res.locals.currentPath === href || res.locals.currentPath.startsWith(`${href}/`)
	}

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

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
app.get('/openapi.json', (req, res) => {
	res.json(swaggerDocument)
})

app.use('/', indexRouter)
app.use('/auth', authRouter)
app.use('/resources', resourcesRouter)
app.use('/posts', postsRouter)
app.use('/data', dataRouter)
app.use('/admin', adminRouter)

app.use((req, res) => {
	res.status(404).render('error', {
		title: 'Página não encontrada',
		message: 'A página pedida não existe.',
	})
})

app.use((err, req, res, next) => {
	console.error('[interface] erro inesperado:', err)
	res.status(500).render('error', {
		title: 'Erro interno',
		message: 'Ocorreu um erro inesperado. Tente novamente.',
	})
})

app.listen(config.port, () => {
	console.log(`[interface] à escuta em :${config.port}`)
})
