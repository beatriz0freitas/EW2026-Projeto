const express = require('express')
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const FacebookStrategy = require('passport-facebook').Strategy

const authController = require('../controllers/authController')
const { config } = require('../lib/config')
const { routeAsync } = require('../lib/web')

const router = express.Router()

if (config.oauth.google.enabled) {
	passport.use(new GoogleStrategy({
		clientID: config.oauth.google.clientId,
		clientSecret: config.oauth.google.clientSecret,
		callbackURL: config.oauth.google.callbackUrl,
	}, async (accessToken, refreshToken, profile, done) => {
		const email = profile.emails && profile.emails[0] ? profile.emails[0].value : ''
		const nome = profile.displayName || email.split('@')[0]
		done(null, { provider: 'google', providerId: profile.id, email, nome })
	}))

	router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
	router.get(
		'/google/callback',
		passport.authenticate('google', { session: false, failureRedirect: '/auth/login' }),
		routeAsync((req, res) => {
			const { provider, providerId, email, nome } = req.user
			return authController.handleOAuthCallback(req, res, provider, providerId, email, nome)
		})
	)
}

if (config.oauth.facebook.enabled) {
	passport.use(new FacebookStrategy({
		clientID: config.oauth.facebook.appId,
		clientSecret: config.oauth.facebook.appSecret,
		callbackURL: config.oauth.facebook.callbackUrl,
		profileFields: ['id', 'displayName', 'emails'],
	}, async (accessToken, refreshToken, profile, done) => {
		const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@facebook.com`
		const nome = profile.displayName || 'User'
		done(null, { provider: 'facebook', providerId: profile.id, email, nome })
	}))

	router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }))
	router.get(
		'/facebook/callback',
		passport.authenticate('facebook', { session: false, failureRedirect: '/auth/login' }),
		routeAsync((req, res) => {
			const { provider, providerId, email, nome } = req.user
			return authController.handleOAuthCallback(req, res, provider, providerId, email, nome)
		})
	)
}

router.get('/login', authController.showLogin)
router.post('/login', routeAsync(authController.login))
router.get('/password-help', authController.showPasswordHelp)
router.get('/register', authController.showRegister)
router.post('/register', routeAsync(authController.register))
router.get('/logout', authController.logout)
router.post('/logout', authController.logout)

module.exports = router
