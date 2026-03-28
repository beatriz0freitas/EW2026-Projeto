const express = require('express')
const mongoose = require('mongoose')

const routes = require('./routes')

const app = express()

app.use(express.json())

app.use((req, res, next) => {
	const d = new Date().toISOString().substring(0, 16)
	console.log(`${req.method} ${req.url} ${d}`)
	next()
})

const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ew2026'
mongoose
	.connect(mongoUrl)
	.then(() => console.log('MongoDB: connected'))
	.catch((err) => console.error('MongoDB: connection error:', err))

app.use('/api', routes)

const port = Number(process.env.PORT || 16025)
app.listen(port, () => {
	console.log(`API listening on port ${port}`)
})

