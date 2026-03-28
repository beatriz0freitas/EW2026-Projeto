const express = require('express')

const PORT = Number(process.env.PORT || 16026)

const app = express()

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.get('/', (req, res) => {
	res.type('text/plain').send('Interface placeholder')
})

app.all('*', (req, res) => {
	res.status(404).type('text/plain').send('Not found')
})

app.listen(PORT, () => {
	console.log(`[interface] listening on :${PORT}`)
})

