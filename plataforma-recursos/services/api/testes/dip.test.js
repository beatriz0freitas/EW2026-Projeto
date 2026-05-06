const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const JSZip = require('jszip')

const { construirDipZip, entradasFicheirosDip } = require('../oais/access/dip')

test('DIP amigável inclui metadados e ficheiros de consumo, sem bag nem SIP original', async () => {
	const raiz = await fsp.mkdtemp(path.join(os.tmpdir(), 'ew2026-dip-'))
	const recurso = {
		_id: 'recurso-1',
		aipPath: path.join(raiz, 'recurso-1'),
		metadata: {
			resource: {
				titulo: 'Aula de teste',
				tipo: 'artigo',
			},
		},
	}

	await fsp.mkdir(path.join(recurso.aipPath, 'bag/data/ficheiros'), { recursive: true })
	await fsp.writeFile(path.join(recurso.aipPath, 'bag/manifest.json'), '{"titulo":"Aula de teste"}')
	await fsp.writeFile(path.join(recurso.aipPath, 'bag/checksums.txt'), 'abc ficheiro.txt')
	await fsp.writeFile(path.join(recurso.aipPath, 'bag/data/ficheiros/aula.pdf'), 'conteudo')
	await fsp.writeFile(path.join(recurso.aipPath, 'sip.zip'), 'zip-original')

	try {
		const dip = await construirDipZip({ resource: recurso, aipDir: raiz })
		const zip = await JSZip.loadAsync(dip.buffer)
		const nomes = Object.keys(zip.files).sort()

		assert.ok(nomes.includes('metadados.json'))
		assert.ok(nomes.includes('ficheiros/aula.pdf'))
		assert.equal(nomes.includes('bag/manifest.json'), false)
		assert.equal(nomes.includes('sip.zip'), false)
	} finally {
		await fsp.rm(raiz, { recursive: true, force: true })
	}
})

test('DIP permite filtrar os ficheiros selecionados', () => {
	const entradas = entradasFicheirosDip([
		{ caminho: 'bag/data/ficheiros/a.pdf', conteudo: Buffer.from('a') },
		{ caminho: 'bag/data/ficheiros/b.pdf', conteudo: Buffer.from('b') },
		{ caminho: 'bag/manifest.json', conteudo: Buffer.from('{}') },
	], ['ficheiros/b.pdf'])

	assert.deepEqual(
		entradas.map((entrada) => entrada.caminho),
		['ficheiros/b.pdf']
	)
})

test('DIP sem seleção explícita inclui todos; seleção vazia não inclui ficheiros', () => {
	const entradasAip = [
		{ caminho: 'bag/data/ficheiros/a.pdf', conteudo: Buffer.from('a') },
		{ caminho: 'bag/data/ficheiros/b.pdf', conteudo: Buffer.from('b') },
	]

	assert.deepEqual(
		entradasFicheirosDip(entradasAip).map((entrada) => entrada.caminho),
		['ficheiros/a.pdf', 'ficheiros/b.pdf']
	)
	assert.deepEqual(entradasFicheirosDip(entradasAip, []), [])
})
