const test = require('node:test')
const assert = require('node:assert/strict')
const JSZip = require('jszip')

const { criarZip } = require('../lib/simpleZip')

test('cria ZIP simples com entradas válidas', async () => {
	const buffer = await criarZip([
		{ caminho: 'docs/ficheiro.txt', conteudo: 'conteúdo de teste' },
		{ caminho: 'dados/valor.json', conteudo: Buffer.from('{"ok":true}') },
	])

	const zip = await JSZip.loadAsync(buffer)
	assert.ok(zip.file('docs/ficheiro.txt'))
	assert.ok(zip.file('dados/valor.json'))
	assert.equal(await zip.file('docs/ficheiro.txt').async('string'), 'conteúdo de teste')
})

test('rejeita criação de ZIP sem entradas', async () => {
	await assert.rejects(
		() => criarZip([]),
		/é necessário indicar pelo menos uma entrada/
	)
})

test('rejeita caminhos inválidos e entradas duplicadas', async () => {
	await assert.rejects(
		() => criarZip([{ caminho: '../fora.txt', conteudo: 'x' }]),
		/caminho ZIP inválido/
	)

	await assert.rejects(
		() => criarZip([
			{ caminho: 'docs/a.txt', conteudo: '1' },
			{ caminho: 'docs/a.txt', conteudo: '2' },
		]),
		/entrada ZIP duplicada/
	)
})