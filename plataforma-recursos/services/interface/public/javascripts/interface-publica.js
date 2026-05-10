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

	function iniciarResumoDinamicoExportacao() {
		const formulario = document.querySelector('[data-export-form]')
		const preview = document.querySelector('[data-export-preview]')
		const stateNode = document.getElementById('data-export-preview-state')
		if (!formulario || !preview || !stateNode) return

		const mainNode = preview.querySelector('[data-preview-main]')
		const limitNode = preview.querySelector('[data-preview-limit]')
		const contentNode = preview.querySelector('[data-preview-content]')
		const listNode = preview.querySelector('[data-preview-list]')
		const emptyNode = preview.querySelector('[data-preview-empty]')
		const filterStatusNode = document.querySelector('[data-filter-toggle-status]')

		const labels = {
			resources: 'Recursos',
			news: 'Notícias',
			users: 'Utilizadores',
			posts: 'Publicações',
			comments: 'Comentários',
			ratings: 'Classificações',
		}

		const fieldLabels = {
			resourceType: 'Tipo de recurso',
			resourceYear: 'Ano do recurso',
			resourceTheme: 'Tema do recurso',
			resourceHashtag: 'Etiqueta do recurso',
			resourceVisibility: 'Visibilidade do recurso',
			resourceProducer: 'Produtor do recurso',
			resourceCreatedFrom: 'Recurso criado desde',
			resourceCreatedTo: 'Recurso criado até',
			newsCreatedBy: 'Autor da notícia',
			newsPublishedFrom: 'Notícia publicada desde',
			newsPublishedTo: 'Notícia publicada até',
			postAuthor: 'Autor da publicação',
			postCreatedFrom: 'Publicação criada desde',
			postCreatedTo: 'Publicação criada até',
			commentAuthor: 'Autor do comentário',
			commentCreatedFrom: 'Comentário criado desde',
			commentCreatedTo: 'Comentário criado até',
			ratingUser: 'Utilizador da classificação',
			ratingStars: 'Estrelas da classificação',
			ratingCreatedFrom: 'Classificação criada desde',
			ratingCreatedTo: 'Classificação criada até',
		}

		const initialState = JSON.parse(stateNode.textContent || '{}')
		const initialFilters = initialState.filterForm || {}

		function getFormData() {
			return new FormData(formulario)
		}

		function textValue(formData, name) {
			return String(formData.get(name) || '').trim()
		}

		function selectedTypes(formData) {
			return formData.getAll('selectedTypes').map((value) => String(value || '').trim()).filter(Boolean)
		}

		function readFilters() {
			const formData = getFormData()
			const types = selectedTypes(formData)
			const visibilityField = formulario.querySelector('[name="resourceVisibility"]:not([type="hidden"])')
			const visibility = textValue(formData, 'resourceVisibility') || (!visibilityField ? initialFilters.resourceVisibility || '' : '')

			return {
				selectedTypes: types,
				resourceType: textValue(formData, 'resourceType'),
				resourceYear: textValue(formData, 'resourceYear'),
				resourceTheme: textValue(formData, 'resourceTheme'),
				resourceHashtag: textValue(formData, 'resourceHashtag'),
				resourceVisibility: visibility,
				resourceProducer: textValue(formData, 'resourceProducer'),
				resourceCreatedFrom: textValue(formData, 'resourceCreatedFrom'),
				resourceCreatedTo: textValue(formData, 'resourceCreatedTo'),
				newsCreatedBy: textValue(formData, 'newsCreatedBy'),
				newsPublishedFrom: textValue(formData, 'newsPublishedFrom'),
				newsPublishedTo: textValue(formData, 'newsPublishedTo'),
				postAuthor: textValue(formData, 'postAuthor'),
				postCreatedFrom: textValue(formData, 'postCreatedFrom'),
				postCreatedTo: textValue(formData, 'postCreatedTo'),
				commentAuthor: textValue(formData, 'commentAuthor'),
				commentCreatedFrom: textValue(formData, 'commentCreatedFrom'),
				commentCreatedTo: textValue(formData, 'commentCreatedTo'),
				ratingUser: textValue(formData, 'ratingUser'),
				ratingStars: textValue(formData, 'ratingStars'),
				ratingCreatedFrom: textValue(formData, 'ratingCreatedFrom'),
				ratingCreatedTo: textValue(formData, 'ratingCreatedTo'),
				quantityLimit: textValue(formData, 'quantityLimit'),
				quantityOrder: textValue(formData, 'quantityOrder') || 'recentes',
			}
		}

		function formatDetailValue(key, value) {
			if (key === 'resourceVisibility') return value === 'publico' ? 'Público' : value === 'privado' ? 'Privado' : value
			return value
		}

		function buildState(filters) {
			const contents = filters.selectedTypes.length
				? filters.selectedTypes.map((type) => labels[type] || type).join(', ')
				: ''
			const principal = contents
				? `Vais exportar apenas: ${contents}.`
				: 'Vais exportar todo o conteúdo da plataforma.'
			const limite = filters.quantityLimit
				? `A plataforma vai usar apenas os ${filters.quantityLimit} itens ${filters.quantityOrder === 'antigos' ? 'mais antigos' : 'mais recentes'} dentro da seleção atual.`
				: 'Sem limite de quantidade: sai tudo o que corresponder aos filtros.'
			const details = Object.entries(fieldLabels)
				.filter(([key]) => String(filters[key] || '').trim() !== '')
				.map(([key, label]) => ({ label, value: formatDetailValue(key, filters[key]) }))
			const activeFilterCount = details.length + (filters.selectedTypes.length ? 1 : 0) + (filters.quantityLimit ? 1 : 0)

			return {
				principal,
				limite,
				contents,
				details,
				hasDetails: details.length > 0,
				activeFilterCount,
			}
		}

		function render() {
			const state = buildState(readFilters())
			if (mainNode) mainNode.textContent = state.principal
			if (limitNode) limitNode.textContent = state.limite
			if (contentNode) {
				contentNode.hidden = !state.contents
				contentNode.textContent = state.contents ? `Tipos de conteúdo escolhidos: ${state.contents}.` : ''
			}
			if (listNode) {
				listNode.hidden = !state.hasDetails
				listNode.replaceChildren(
					...state.details.map((entry) => {
						const item = document.createElement('li')
						const strong = document.createElement('strong')
						strong.textContent = `${entry.label}: `
						item.appendChild(strong)
						item.append(entry.value)
						return item
					})
				)
			}
			if (emptyNode) emptyNode.hidden = state.hasDetails
			if (filterStatusNode) {
				filterStatusNode.textContent = state.activeFilterCount
					? `${state.activeFilterCount} filtro${state.activeFilterCount > 1 ? 's' : ''} ativo${state.activeFilterCount > 1 ? 's' : ''}`
					: 'Sem filtros ativos'
			}
		}

		formulario.addEventListener('input', render)
		formulario.addEventListener('change', render)
		render()
	}

	iniciarAlternadorNavegacao()
	iniciarBotoesLimparFicheiro()
	iniciarResumoDinamicoExportacao()
})()
