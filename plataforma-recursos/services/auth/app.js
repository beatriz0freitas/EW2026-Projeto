const express = require('express')

const PORT = Number(process.env.PORT || 16027)

const app = express()
app.use(express.json())

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.all('*', (req, res) => {
	res.status(501).json({ ok: false, error: 'not_implemented' })
})

app.listen(PORT, () => {
	console.log(`[auth] listening on :${PORT}`)
})

