(function () {
	const formulario = document.getElementById('form-simples')
	if (!formulario) return

	const contexto = criarContexto(formulario)
	const validadores = criarValidadores(contexto)

	iniciarFormulario(contexto, validadores)

	function criarContexto(formularioAtual) {
		const anoAtual = new Date().getFullYear()
		const campos = {
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
		}

		return {
			formulario: formularioAtual,
			estado: {
				submissaoTentada: false,
				ficheirosSelecionados: [],
			},
			campos,
			interface: {
				contadorDescricao: document.getElementById('contador-descricao'),
				infoFicheiros: document.getElementById('info-ficheiros'),
				ficheirosTotal: document.getElementById('ficheiros-total'),
				ficheirosTamanho: document.getElementById('ficheiros-tamanho'),
				ficheirosLista: document.getElementById('ficheiros-lista'),
				estadoGeral: document.getElementById('estado-geral'),
				estadoProgresso: document.getElementById('estado-progresso'),
				botoesExemplo: Array.from(document.querySelectorAll('[data-example]')),
				camposAuxiliares: criarMapaCamposAuxiliares(),
				itensResumo: criarMapaItensResumo(),
			},
			exemplos: {
				relatorio: {
					titulo: 'Relatório de apoio a Estatística',
					subtitulo: 'Exercícios e amostras anonimizadas',
					tipo: 'relatorio',
					ano: String(anoAtual),
					tema: 'análise de dados',
					hashtags: 'dados, estatistica, ensino',
					dataCriacao: `${anoAtual}-02-12`,
					descricao: 'Conjunto de dados e ficheiros de apoio para aulas, exercícios práticos e reutilização em contexto académico.',
					visibilidade: 'privado',
				},
				artigo: {
					titulo: 'Artigo de exemplo sobre preservação digital',
					subtitulo: 'Versão para partilha em aula',
					tipo: 'artigo',
					ano: String(anoAtual - 1),
					tema: 'preservação digital',
					hashtags: 'preservacao, arquivo, artigo',
					dataCriacao: `${anoAtual - 1}-10-05`,
					descricao: 'Artigo em PDF com apontamentos complementares e referências para discussão em contexto letivo.',
					visibilidade: 'publico',
				},
				slides: {
					titulo: 'Slides de apoio à aula',
					subtitulo: 'Resumo visual da unidade',
					tipo: 'slides',
					ano: String(anoAtual),
					tema: 'materiais de aula',
					hashtags: 'slides, aula, apoio',
					dataCriacao: `${anoAtual}-03-18`,
					descricao: 'Apresentação de apoio com estrutura da aula, conceitos-chave e referências para estudo autónomo.',
					visibilidade: 'privado',
				},
			},
		}
	}

	function criarMapaCamposAuxiliares() {
		const mapa = {}
		for (const involucro of document.querySelectorAll('[data-field]')) {
			const nome = involucro.dataset.field
			mapa[nome] = {
				involucro,
				feedback: involucro.querySelector('.field-feedback'),
			}
		}
		return mapa
	}

	function criarMapaItensResumo() {
		const mapa = {}
		for (const item of document.querySelectorAll('[data-status]')) {
			mapa[item.dataset.status] = {
				item,
				valor: item.querySelector('.validation-item__value'),
			}
		}
		return mapa
	}

	function criarValidadores(ctx) {
		return {
			titulo: function (modoRigido) {
				return validarObrigatorio(ctx, 'titulo', {
					mensagemErro: 'O título é obrigatório.',
					mensagemSucesso: 'Título pronto.',
				}, modoRigido)
			},
			tipo: function (modoRigido) {
				return validarObrigatorio(ctx, 'tipo', {
					mensagemErro: 'Indica o tipo do recurso.',
					mensagemSucesso: 'Tipo pronto.',
				}, modoRigido)
			},
			visibilidade: function (modoRigido) {
				const valor = obterTexto(ctx.campos.visibilidade)
				if (!valor) {
					atualizarCampo(ctx, 'visibilidade', modoRigido ? 'invalid' : 'neutral', modoRigido ? 'Escolhe a visibilidade do recurso.' : null)
					atualizarResumo(ctx, 'visibilidade', modoRigido ? 'invalid' : 'neutral', 'Por preencher')
					return false
				}

				atualizarCampo(
					ctx,
					'visibilidade',
					'valid',
					valor === 'publico'
						? 'O recurso ficará visível a todos.'
						: 'O recurso ficará visível apenas para quem tem acesso.'
				)
				atualizarResumo(ctx, 'visibilidade', 'valid', valor)
				return true
			},
			datas: function () {
				const anoValido = validarAno(ctx)
				const dataValida = validarDataCriacao(ctx)
				const semAno = obterTexto(ctx.campos.ano) === ''
				const semData = obterTexto(ctx.campos.dataCriacao) === ''

				if (semAno && semData) {
					atualizarResumo(ctx, 'datas', 'neutral', 'Opcional')
					return true
				}

				if (anoValido && dataValida) {
					atualizarResumo(ctx, 'datas', 'valid', 'OK')
					return true
				}

				atualizarResumo(ctx, 'datas', 'invalid', 'Rever formato')
				return false
			},
			hashtags: function () {
				const valor = obterTexto(ctx.campos.hashtags)
				if (!valor) {
					atualizarCampo(ctx, 'hashtags', 'neutral')
					atualizarResumo(ctx, 'hashtags', 'neutral', 'Opcional')
					return true
				}

				const partes = valor.split(',')
				const etiquetas = extrairEtiquetas(valor)
				const formatoValido = partes.every(function (parte) {
					return parte.trim().length > 0
				})

				if (!etiquetas.length || !formatoValido) {
					atualizarCampo(ctx, 'hashtags', 'invalid', 'Separa as etiquetas por vírgulas, sem deixar entradas vazias.')
					atualizarResumo(ctx, 'hashtags', 'invalid', 'Rever formato')
					return false
				}

				atualizarCampo(ctx, 'hashtags', 'valid', `${etiquetas.length} etiqueta(s) pronta(s).`)
				atualizarResumo(ctx, 'hashtags', 'valid', `${etiquetas.length} etiqueta(s)`)
				return true
			},
			descricao: function () {
				const valor = String(ctx.campos.descricao && ctx.campos.descricao.value || '')
				const tamanho = valor.length

				if (ctx.interface.contadorDescricao) ctx.interface.contadorDescricao.textContent = String(tamanho)

				if (!valor.trim()) {
					atualizarCampo(ctx, 'descricao', 'neutral')
					return true
				}

				if (tamanho > 2000) {
					atualizarCampo(ctx, 'descricao', 'invalid', 'A descrição excede o limite de 2000 caracteres.')
					return false
				}

				atualizarCampo(ctx, 'descricao', 'valid', 'Descrição dentro do limite.')
				return true
			},
			ficheiros: function (modoRigido) {
				return validarFicheiros(ctx, modoRigido)
			},
		}
	}

	function iniciarFormulario(ctx, validadoresAtivos) {
		ligarBotoesExemplo(ctx, validadoresAtivos)
		ligarCampos(ctx, validadoresAtivos)
		ligarFicheiros(ctx, validadoresAtivos)
		ligarSubmissao(ctx, validadoresAtivos)
		atualizarValidacao(ctx, validadoresAtivos, { rigido: false })
	}

	function ligarBotoesExemplo(ctx, validadoresAtivos) {
		for (const botao of ctx.interface.botoesExemplo) {
			botao.addEventListener('click', function () {
				aplicarExemplo(ctx, botao.dataset.example)
				atualizarValidacao(ctx, validadoresAtivos, { rigido: false })
			})
		}
	}

	function ligarCampos(ctx, validadoresAtivos) {
		for (const nomeCampo of ['titulo', 'subtitulo', 'tipo', 'ano', 'tema', 'hashtags', 'dataCriacao', 'descricao', 'visibilidade']) {
			const campo = ctx.campos[nomeCampo]
			if (!campo) continue

			campo.addEventListener('input', function () {
				atualizarValidacao(ctx, validadoresAtivos)
			})
			campo.addEventListener('change', function () {
				atualizarValidacao(ctx, validadoresAtivos)
			})
		}
	}

	function ligarFicheiros(ctx, validadoresAtivos) {
		if (ctx.campos.ficheiros) {
			ctx.campos.ficheiros.addEventListener('change', function () {
				adicionarFicheiros(ctx, Array.from(ctx.campos.ficheiros.files || []))
				atualizarValidacao(ctx, validadoresAtivos)
			})
		}

		if (ctx.interface.ficheirosLista) {
			ctx.interface.ficheirosLista.addEventListener('click', function (evento) {
				const botao = evento.target.closest('[data-remove-file-index]')
				if (!botao) return

				removerFicheiro(ctx, Number(botao.dataset.removeFileIndex))
				atualizarValidacao(ctx, validadoresAtivos)
			})
		}
	}

	function ligarSubmissao(ctx, validadoresAtivos) {
		ctx.formulario.addEventListener('invalid', function () {
			ctx.estado.submissaoTentada = true
			atualizarValidacao(ctx, validadoresAtivos, { rigido: true })
		}, true)

		ctx.formulario.addEventListener('submit', function () {
			ctx.estado.submissaoTentada = true
			atualizarValidacao(ctx, validadoresAtivos, { rigido: true })
		})
	}

	function atualizarValidacao(ctx, validadoresAtivos, opcoes) {
		const modoRigido = Boolean(opcoes && opcoes.rigido) || ctx.estado.submissaoTentada
		const resultados = {}

		for (const [nome, validador] of Object.entries(validadoresAtivos)) {
			resultados[nome] = validador(modoRigido)
		}

		atualizarEstadoGlobal(ctx, resultados)
	}

	function aplicarExemplo(ctx, nomeExemplo) {
		if (nomeExemplo === 'clear') {
			ctx.formulario.reset()
			sincronizarEntradaFicheiros(ctx, [])
			if (ctx.interface.ficheirosLista) ctx.interface.ficheirosLista.innerHTML = ''
			ctx.estado.submissaoTentada = false
			return
		}

		const exemplo = ctx.exemplos[nomeExemplo]
		if (!exemplo) return

		for (const [nomeCampo, valor] of Object.entries(exemplo)) {
			if (ctx.campos[nomeCampo]) ctx.campos[nomeCampo].value = valor
		}
	}

	function validarObrigatorio(ctx, nomeCampo, opcoes, modoRigido) {
		const valor = obterTexto(ctx.campos[nomeCampo])
		if (!valor) {
			atualizarCampo(ctx, nomeCampo, modoRigido ? 'invalid' : 'neutral', modoRigido ? opcoes.mensagemErro : null)
			atualizarResumo(ctx, nomeCampo, modoRigido ? 'invalid' : 'neutral', 'Por preencher')
			return false
		}

		atualizarCampo(ctx, nomeCampo, 'valid', opcoes.mensagemSucesso)
		atualizarResumo(ctx, nomeCampo, 'valid', 'OK')
		return true
	}

	function validarAno(ctx) {
		const valorBruto = obterTexto(ctx.campos.ano)
		if (!valorBruto) {
			atualizarCampo(ctx, 'ano', 'neutral')
			return true
		}

		const valor = Number(valorBruto)
		if (!Number.isInteger(valor) || valor < 0 || valor > 3000) {
			atualizarCampo(ctx, 'ano', 'invalid', 'Escreve um ano válido.')
			return false
		}

		atualizarCampo(ctx, 'ano', 'valid', 'Ano pronto.')
		return true
	}

	function validarDataCriacao(ctx) {
		const valor = obterTexto(ctx.campos.dataCriacao)
		if (!valor) {
			atualizarCampo(ctx, 'dataCriacao', 'neutral')
			return true
		}

		if (!temFormatoDataValido(valor)) {
			atualizarCampo(ctx, 'dataCriacao', 'invalid', 'Usa um formato como 2024 ou 2024-10-12.')
			return false
		}

		atualizarCampo(ctx, 'dataCriacao', 'valid', 'Data pronta.')
		return true
	}

	function validarFicheiros(ctx, modoRigido) {
		const ficheiros = ctx.estado.ficheirosSelecionados
		const total = ficheiros.length
		const tamanhoTotal = ficheiros.reduce(function (soma, ficheiro) {
			return soma + (ficheiro.size || 0)
		}, 0)

		if (ctx.interface.ficheirosTotal) ctx.interface.ficheirosTotal.textContent = String(total)
		if (ctx.interface.ficheirosTamanho) ctx.interface.ficheirosTamanho.textContent = formatarBytes(tamanhoTotal)
		renderizarListaFicheiros(ctx, ficheiros)

		if (!total) {
			atualizarCampo(ctx, 'ficheiros', modoRigido ? 'invalid' : 'neutral', modoRigido ? 'Seleciona pelo menos um ficheiro.' : null)
			atualizarResumo(ctx, 'ficheiros', modoRigido ? 'invalid' : 'neutral', 'Por anexar')
			if (ctx.interface.infoFicheiros) {
				ctx.interface.infoFicheiros.textContent = modoRigido
					? 'Seleciona pelo menos um ficheiro para enviar o recurso.'
					: 'Podes anexar até 20 ficheiros; a plataforma prepara o envio automaticamente.'
			}
			return false
		}

		if (total > 20) {
			atualizarCampo(ctx, 'ficheiros', 'invalid', 'O limite é 20 ficheiros por submissão.')
			atualizarResumo(ctx, 'ficheiros', 'invalid', 'Acima do limite')
			if (ctx.interface.infoFicheiros) {
				ctx.interface.infoFicheiros.textContent = `${total} ficheiros selecionados; remove alguns para ficar dentro do limite.`
			}
			return false
		}

		atualizarCampo(ctx, 'ficheiros', 'valid', `${total} ficheiro(s) pronto(s) para enviar.`)
		atualizarResumo(ctx, 'ficheiros', 'valid', `${total} ficheiro(s)`)
		if (ctx.interface.infoFicheiros) {
			ctx.interface.infoFicheiros.textContent = `${total} ficheiro(s) · ${formatarBytes(tamanhoTotal)} no total`
		}

		return true
	}

	function atualizarEstadoGlobal(ctx, resultados) {
		const listaResultados = Object.values(resultados)
		const totalVerificacoes = listaResultados.length
		const verificacoesValidas = listaResultados.filter(Boolean).length
		const percentagem = Math.round((verificacoesValidas / totalVerificacoes) * 100)

		if (ctx.interface.estadoProgresso) ctx.interface.estadoProgresso.style.width = `${percentagem}%`

		const obrigatoriosProntos = resultados.titulo && resultados.tipo && resultados.visibilidade && resultados.ficheiros
		const tudoPronto = listaResultados.every(Boolean)
		if (!ctx.interface.estadoGeral) return

		if (tudoPronto && obrigatoriosProntos) {
			ctx.interface.estadoGeral.textContent = 'Tudo pronto: já podes submeter o recurso com confiança.'
			ctx.interface.estadoGeral.dataset.state = 'valid'
			return
		}

		if (obrigatoriosProntos) {
			ctx.interface.estadoGeral.textContent = 'Os campos obrigatórios estão prontos; podes rever os opcionais para ajudar outras pessoas a encontrar o recurso.'
			ctx.interface.estadoGeral.dataset.state = 'warning'
			return
		}

		ctx.interface.estadoGeral.textContent = `Ainda faltam ${totalVerificacoes - verificacoesValidas} ponto(s) para poderes enviar.`
		ctx.interface.estadoGeral.dataset.state = 'neutral'
	}

	function adicionarFicheiros(ctx, novosFicheiros) {
		const proximosFicheiros = [...ctx.estado.ficheirosSelecionados]

		for (const ficheiro of novosFicheiros) {
			if (!proximosFicheiros.some(function (existente) { return saoMesmoFicheiro(existente, ficheiro) })) {
				proximosFicheiros.push(ficheiro)
			}
		}

		sincronizarEntradaFicheiros(ctx, proximosFicheiros)
	}

	function removerFicheiro(ctx, indice) {
		const ficheiros = [...ctx.estado.ficheirosSelecionados]
		if (!Number.isInteger(indice) || indice < 0 || indice >= ficheiros.length) return

		sincronizarEntradaFicheiros(ctx, ficheiros.filter(function (_, posicao) {
			return posicao !== indice
		}))
	}

	function sincronizarEntradaFicheiros(ctx, ficheiros) {
		ctx.estado.ficheirosSelecionados = ficheiros
		substituirFicheirosEntrada(ctx.campos.ficheiros, ficheiros)
	}

	function substituirFicheirosEntrada(entrada, ficheiros) {
		if (!entrada) return false
		if (typeof DataTransfer === 'undefined') {
			entrada.value = ''
			return false
		}

		const transferencia = new DataTransfer()
		for (const ficheiro of ficheiros) transferencia.items.add(ficheiro)
		entrada.files = transferencia.files
		return true
	}

	function renderizarListaFicheiros(ctx, ficheiros) {
		if (!ctx.interface.ficheirosLista) return
		ctx.interface.ficheirosLista.innerHTML = ''

		for (const [indice, ficheiro] of ficheiros.entries()) {
			ctx.interface.ficheirosLista.appendChild(criarItemFicheiro(ficheiro, indice))
		}
	}

	function criarItemFicheiro(ficheiro, indice) {
		const item = document.createElement('li')
		item.className = 'file-list__item'

		const detalhes = document.createElement('span')
		detalhes.className = 'file-list__details'
		detalhes.textContent = `${ficheiro.name} (${formatarBytes(ficheiro.size || 0)})`

		const botaoRemover = document.createElement('button')
		botaoRemover.className = 'file-list__remove'
		botaoRemover.type = 'button'
		botaoRemover.dataset.removeFileIndex = String(indice)
		botaoRemover.setAttribute('aria-label', `Remover ${ficheiro.name}`)
		botaoRemover.textContent = '×'

		item.appendChild(detalhes)
		item.appendChild(botaoRemover)
		return item
	}

	function atualizarCampo(ctx, nomeCampo, estado, mensagem) {
		const configuracao = ctx.interface.camposAuxiliares[nomeCampo]
		if (!configuracao) return

		configuracao.involucro.dataset.state = estado
		if (!configuracao.feedback) return

		const textoBase = configuracao.feedback.dataset.defaultText || ''
		configuracao.feedback.textContent = mensagem || textoBase
	}

	function atualizarResumo(ctx, nomeCampo, estado, texto) {
		const configuracao = ctx.interface.itensResumo[nomeCampo]
		if (!configuracao) return

		configuracao.item.dataset.state = estado
		if (configuracao.valor) configuracao.valor.textContent = texto
	}

	function obterTexto(campo) {
		return String(campo && campo.value || '').trim()
	}

	function extrairEtiquetas(valor) {
		return String(valor || '')
			.split(',')
			.map(function (item) { return item.trim() })
			.filter(Boolean)
	}

	function temFormatoDataValido(valor) {
		return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(valor)
	}

	function saoMesmoFicheiro(primeiro, segundo) {
		return primeiro.name === segundo.name
			&& primeiro.size === segundo.size
			&& primeiro.lastModified === segundo.lastModified
	}

	function formatarBytes(bytes) {
		if (!bytes) return '0 B'

		const unidades = ['B', 'KB', 'MB', 'GB']
		let valor = bytes
		let indiceUnidade = 0

		while (valor >= 1024 && indiceUnidade < unidades.length - 1) {
			valor /= 1024
			indiceUnidade += 1
		}

		const casasDecimais = valor >= 10 || indiceUnidade === 0 ? 0 : 1
		return `${valor.toFixed(casasDecimais)} ${unidades[indiceUnidade]}`
	}
})()
