function requiredEnv(name) {
	const value = process.env[name]
	if (!value) {
		throw new Error(`${name} em falta. Define ${name} no ambiente para arrancar o serviço auth.`)
	}
	return value
}

const config = {
	port: Number(process.env.PORT || 16027),
	mongoUrl: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ew2026',

	jwt: {
		secret: requiredEnv('JWT_SECRET'),
		expiresIn: process.env.JWT_EXPIRES || '24h',
	},

	cookies: {
		name: process.env.AUTH_COOKIE_NAME || 'ew.auth',
		sameSite: process.env.AUTH_COOKIE_SAMESITE || 'lax',
		domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
		secure: process.env.NODE_ENV === 'production',
		path: '/',
	},

	cors: {
		origin: process.env.AUTH_CORS_ORIGIN || 'http://localhost:16020',
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
	},
}

module.exports = {
	config,
}
