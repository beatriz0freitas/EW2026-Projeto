const express = require('express')

const router = express.Router()

router.get('/', (req, res) => {
	res.render('index', {
		title: 'Plataforma de Recursos Educativos',
	})
})

module.exports = router

