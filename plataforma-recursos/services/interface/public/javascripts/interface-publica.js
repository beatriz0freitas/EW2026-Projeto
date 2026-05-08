(function () {
	const botaoNavegacao = document.querySelector('[data-nav-toggle]')
	const painelNavegacao = document.querySelector('[data-nav-panel]')

	function iniciarAlternadorNavegacao() {
		if (!botaoNavegacao || !painelNavegacao) return

		function definirPainelAberto(estaAberto) {
			botaoNavegacao.setAttribute('aria-expanded', estaAberto ? 'true' : 'false')
			painelNavegacao.classList.toggle('is-open', estaAberto)
		}

		definirPainelAberto(false)

		botaoNavegacao.addEventListener('click', function () {
			const estaAberto = botaoNavegacao.getAttribute('aria-expanded') === 'true'
			definirPainelAberto(!estaAberto)
		})

		for (const ligacao of painelNavegacao.querySelectorAll('a')) {
			ligacao.addEventListener('click', function () {
				if (window.innerWidth <= 900) definirPainelAberto(false)
			})
		}

		window.addEventListener('resize', function () {
			if (window.innerWidth > 900) definirPainelAberto(false)
		})
	}

	function atualizarBotaoLimpar(botao, entrada) {
		const temFicheiro = Boolean(entrada && entrada.files && entrada.files.length)
		botao.hidden = !temFicheiro
		botao.disabled = !temFicheiro
	}

	function iniciarBotoesLimparFicheiro() {
		for (const botao of document.querySelectorAll('[data-clear-file]')) {
			const idEntrada = botao.dataset.clearFile
			const entrada = idEntrada ? document.getElementById(idEntrada) : null

			if (!entrada || entrada.type !== 'file') continue

			atualizarBotaoLimpar(botao, entrada)

			entrada.addEventListener('change', function () {
				atualizarBotaoLimpar(botao, entrada)
			})

			botao.addEventListener('click', function () {
				entrada.value = ''
				entrada.dispatchEvent(new Event('change', { bubbles: true }))
				atualizarBotaoLimpar(botao, entrada)
			})
		}
	}

	iniciarAlternadorNavegacao()
	iniciarBotoesLimparFicheiro()
})()
