(function () {
	const form = document.getElementById('form-simples');
	if (!form) return;

	const currentYear = new Date().getFullYear();
	const fields = {
		titulo: document.getElementById('titulo'),
		subtitulo: document.getElementById('subtitulo'),
		tipo: document.getElementById('tipo'),
		ano: document.getElementById('ano'),
		tema: document.getElementById('tema'),
		hashtags: document.getElementById('hashtags'),
		dataCriacao: document.getElementById('dataCriacao'),
		descricao: document.getElementById('descricao'),
		visibilidade: document.getElementById('visibilidade'),
		ficheiros: document.getElementById('ficheiros'),
	};

	const contadorDescricao = document.getElementById('contador-descricao');
	const infoFicheiros = document.getElementById('info-ficheiros');
	const ficheirosTotal = document.getElementById('ficheiros-total');
	const ficheirosTamanho = document.getElementById('ficheiros-tamanho');
	const ficheirosLista = document.getElementById('ficheiros-lista');
	const estadoGeral = document.getElementById('estado-geral');
	const estadoProgresso = document.getElementById('estado-progresso');
	const exampleButtons = document.querySelectorAll('[data-example]');

	const statusItems = {
		titulo: document.querySelector('[data-status="titulo"]'),
		tipo: document.querySelector('[data-status="tipo"]'),
		visibilidade: document.querySelector('[data-status="visibilidade"]'),
		datas: document.querySelector('[data-status="datas"]'),
		hashtags: document.querySelector('[data-status="hashtags"]'),
		ficheiros: document.querySelector('[data-status="ficheiros"]'),
	};

	const examples = {
		dataset: {
			titulo: 'Conjunto de dados de apoio a Estatística',
			subtitulo: 'Exercícios e amostras anonimizadas',
			tipo: 'dados',
			ano: String(currentYear),
			tema: 'análise de dados',
			hashtags: 'dados, estatistica, ensino',
			dataCriacao: `${currentYear}-02-12`,
			descricao: 'Conjunto de dados e ficheiros de apoio para aulas, exercícios práticos e reutilização em contexto académico.',
			visibilidade: 'privado',
		},
		artigo: {
			titulo: 'Artigo de exemplo sobre preservação digital',
			subtitulo: 'Versão para partilha em aula',
			tipo: 'artigo',
			ano: String(currentYear - 1),
			tema: 'preservação digital',
			hashtags: 'preservacao, arquivo, artigo',
			dataCriacao: `${currentYear - 1}-10-05`,
			descricao: 'Artigo em PDF com apontamentos complementares e referências para discussão em contexto letivo.',
			visibilidade: 'publico',
		},
		slides: {
			titulo: 'Slides de apoio à aula',
			subtitulo: 'Resumo visual da unidade',
			tipo: 'slides',
			ano: String(currentYear),
			tema: 'materiais de aula',
			hashtags: 'slides, aula, apoio',
			dataCriacao: `${currentYear}-03-18`,
			descricao: 'Apresentação de apoio com estrutura da aula, conceitos-chave e referências para estudo autónomo.',
			visibilidade: 'privado',
		},
	};

	let hasTriedSubmit = false;

	function getFieldWrapper(name) {
		return document.querySelector(`[data-field="${name}"]`);
	}

	function getFieldFeedback(name) {
		return getFieldWrapper(name)?.querySelector('.field-feedback') || null;
	}

	function setFieldState(name, state, message) {
		const wrapper = getFieldWrapper(name);
		if (!wrapper) return;

		wrapper.dataset.state = state;

		const feedback = getFieldFeedback(name);
		if (!feedback) return;

		const defaultText = feedback.dataset.defaultText || '';
		feedback.textContent = message || defaultText;
	}

	function setStatusItem(name, state, text) {
		const item = statusItems[name];
		if (!item) return;
		item.dataset.state = state;
		const value = item.querySelector('.validation-item__value');
		if (value) value.textContent = text;
	}

	function formatBytes(bytes) {
		if (!bytes) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = bytes;
		let unitIndex = 0;
		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex += 1;
		}
		const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
		return `${value.toFixed(digits)} ${units[unitIndex]}`;
	}

	function isValidDateLike(value) {
		if (!value) return true;
		return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value);
	}

	function parseHashtags(value) {
		return String(value || '')
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function validateTitulo(strict) {
		const value = String(fields.titulo?.value || '').trim();
		if (!value) {
			setFieldState('titulo', strict ? 'invalid' : 'neutral', strict ? 'O título é obrigatório.' : null);
			setStatusItem('titulo', strict ? 'invalid' : 'neutral', 'Por preencher');
			return false;
		}
		setFieldState('titulo', 'valid', 'Título pronto.');
		setStatusItem('titulo', 'valid', 'OK');
		return true;
	}

	function validateTipo(strict) {
		const value = String(fields.tipo?.value || '').trim();
		if (!value) {
			setFieldState('tipo', strict ? 'invalid' : 'neutral', strict ? 'Indica o tipo do recurso.' : null);
			setStatusItem('tipo', strict ? 'invalid' : 'neutral', 'Por preencher');
			return false;
		}
		setFieldState('tipo', 'valid', 'Tipo pronto.');
		setStatusItem('tipo', 'valid', 'OK');
		return true;
	}

	function validateAno() {
		const raw = String(fields.ano?.value || '').trim();
		if (!raw) {
			setFieldState('ano', 'neutral');
			return true;
		}

		const value = Number(raw);
		if (!Number.isInteger(value) || value < 0 || value > 3000) {
			setFieldState('ano', 'invalid', 'Escreve um ano válido.');
			return false;
		}

		setFieldState('ano', 'valid', 'Ano pronto.');
		return true;
	}

	function validateDataCriacao() {
		const value = String(fields.dataCriacao?.value || '').trim();
		if (!value) {
			setFieldState('dataCriacao', 'neutral');
			return true;
		}

		if (!isValidDateLike(value)) {
			setFieldState('dataCriacao', 'invalid', 'Usa um formato como 2024 ou 2024-10-12.');
			return false;
		}

		setFieldState('dataCriacao', 'valid', 'Data pronta.');
		return true;
	}

	function validateDatas() {
		const anoOk = validateAno();
		const dataOk = validateDataCriacao();

		if (String(fields.ano?.value || '').trim() === '' && String(fields.dataCriacao?.value || '').trim() === '') {
			setStatusItem('datas', 'neutral', 'Opcional');
			return anoOk && dataOk;
		}

		if (anoOk && dataOk) {
			setStatusItem('datas', 'valid', 'OK');
			return true;
		}

		setStatusItem('datas', 'invalid', 'Rever formato');
		return false;
	}

	function validateHashtags() {
		const value = String(fields.hashtags?.value || '').trim();
		if (!value) {
			setFieldState('hashtags', 'neutral');
			setStatusItem('hashtags', 'neutral', 'Opcional');
			return true;
		}

		const parts = value.split(',');
		const tags = parseHashtags(value);
		const isConsistent = parts.every((part) => part.trim().length > 0);
		if (!tags.length || !isConsistent) {
			setFieldState('hashtags', 'invalid', 'Separa as etiquetas por vírgulas, sem deixar entradas vazias.');
			setStatusItem('hashtags', 'invalid', 'Rever formato');
			return false;
		}

		setFieldState('hashtags', 'valid', `${tags.length} etiqueta(s) pronta(s).`);
		setStatusItem('hashtags', 'valid', `${tags.length} etiqueta(s)`);
		return true;
	}

	function validateDescricao() {
		const value = String(fields.descricao?.value || '');
		const size = value.length;
		if (contadorDescricao) contadorDescricao.textContent = String(size);

		if (!value.trim()) {
			setFieldState('descricao', 'neutral');
			return true;
		}

		if (size > 2000) {
			setFieldState('descricao', 'invalid', 'A descrição excede o limite de 2000 caracteres.');
			return false;
		}

		setFieldState('descricao', 'valid', 'Descrição dentro do limite.');
		return true;
	}

	function validateVisibilidade(strict) {
		const value = String(fields.visibilidade?.value || '').trim();
		if (!value) {
			setFieldState('visibilidade', strict ? 'invalid' : 'neutral', strict ? 'Escolhe a visibilidade do recurso.' : null);
			setStatusItem('visibilidade', strict ? 'invalid' : 'neutral', 'Por preencher');
			return false;
		}

		setFieldState('visibilidade', 'valid', value === 'publico' ? 'O recurso ficará visível a todos.' : 'O recurso ficará visível apenas para quem tem acesso.');
		setStatusItem('visibilidade', 'valid', value);
		return true;
	}

	function renderFileList(files) {
		if (!ficheirosLista) return;
		ficheirosLista.innerHTML = '';

		const visibleFiles = files.slice(0, 5);
		for (const file of visibleFiles) {
			const item = document.createElement('li');
			item.className = 'file-list__item';
			item.textContent = `${file.name} (${formatBytes(file.size || 0)})`;
			ficheirosLista.appendChild(item);
		}

		if (files.length > visibleFiles.length) {
			const item = document.createElement('li');
			item.className = 'file-list__item file-list__item--more';
			item.textContent = `+${files.length - visibleFiles.length} ficheiro(s) adicionais`;
			ficheirosLista.appendChild(item);
		}
	}

	function validateFicheiros(strict) {
		const files = Array.from(fields.ficheiros?.files || []);
		const total = files.length;
		const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

		if (ficheirosTotal) ficheirosTotal.textContent = String(total);
		if (ficheirosTamanho) ficheirosTamanho.textContent = formatBytes(totalSize);
		renderFileList(files);

		if (!total) {
			setFieldState('ficheiros', strict ? 'invalid' : 'neutral', strict ? 'Seleciona pelo menos um ficheiro.' : null);
			setStatusItem('ficheiros', strict ? 'invalid' : 'neutral', 'Por anexar');
			if (infoFicheiros) {
				infoFicheiros.textContent = strict
					? 'Seleciona pelo menos um ficheiro para enviar o recurso.'
					: 'Podes anexar até 20 ficheiros; a plataforma prepara o envio automaticamente.';
			}
			return false;
		}

		if (total > 20) {
			setFieldState('ficheiros', 'invalid', 'O limite é 20 ficheiros por submissão.');
			setStatusItem('ficheiros', 'invalid', 'Acima do limite');
			if (infoFicheiros) infoFicheiros.textContent = `${total} ficheiros selecionados; remove alguns para ficar dentro do limite.`;
			return false;
		}

		setFieldState('ficheiros', 'valid', `${total} ficheiro(s) pronto(s) para enviar.`);
		setStatusItem('ficheiros', 'valid', `${total} ficheiro(s)`);
		if (infoFicheiros) infoFicheiros.textContent = `${total} ficheiro(s) · ${formatBytes(totalSize)} no total`;
		return true;
	}

	function updateOverallState(results) {
		const values = Object.values(results);
		const totalChecks = values.length;
		const okChecks = values.filter(Boolean).length;
		const percent = Math.round((okChecks / totalChecks) * 100);

		if (estadoProgresso) estadoProgresso.style.width = `${percent}%`;

		const requiredReady = results.titulo && results.tipo && results.visibilidade && results.ficheiros;
		const allReady = values.every(Boolean);

		if (!estadoGeral) return;

		if (allReady && requiredReady) {
			estadoGeral.textContent = 'Tudo pronto: já podes submeter o recurso com confiança.';
			estadoGeral.dataset.state = 'valid';
			return;
		}

		if (requiredReady) {
			estadoGeral.textContent = 'Os campos obrigatórios estão prontos; podes rever os opcionais para ajudar outras pessoas a encontrar o recurso.';
			estadoGeral.dataset.state = 'warning';
			return;
		}

		estadoGeral.textContent = `Ainda faltam ${totalChecks - okChecks} ponto(s) para poderes enviar.`;
		estadoGeral.dataset.state = 'neutral';
	}

	function refreshValidation(options) {
		const strict = Boolean(options?.strict || hasTriedSubmit);
		const results = {
			titulo: validateTitulo(strict),
			tipo: validateTipo(strict),
			visibilidade: validateVisibilidade(strict),
			datas: validateDatas(),
			hashtags: validateHashtags(),
			descricao: validateDescricao(),
			ficheiros: validateFicheiros(strict),
		};

		updateOverallState(results);
	}

	function fillExample(name) {
		if (name === 'clear') {
			form.reset();
			if (ficheirosLista) ficheirosLista.innerHTML = '';
			hasTriedSubmit = false;
			refreshValidation({ strict: false });
			return;
		}

		const example = examples[name];
		if (!example) return;

		for (const [key, value] of Object.entries(example)) {
			if (fields[key]) fields[key].value = value;
		}

		refreshValidation({ strict: false });
	}

	for (const button of exampleButtons) {
		button.addEventListener('click', () => fillExample(button.dataset.example));
	}

	for (const field of [fields.titulo, fields.subtitulo, fields.tipo, fields.ano, fields.tema, fields.hashtags, fields.dataCriacao, fields.descricao, fields.visibilidade]) {
		if (!field) continue;
		field.addEventListener('input', refreshValidation);
		field.addEventListener('change', refreshValidation);
	}

	if (fields.ficheiros) {
		fields.ficheiros.addEventListener('change', refreshValidation);
	}

	form.addEventListener('invalid', () => {
		hasTriedSubmit = true;
		refreshValidation({ strict: true });
	}, true);

	form.addEventListener('submit', () => {
		hasTriedSubmit = true;
		refreshValidation({ strict: true });
	});

	refreshValidation({ strict: false });
})();
