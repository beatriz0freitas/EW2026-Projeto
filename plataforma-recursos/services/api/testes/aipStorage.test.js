const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')

const {
	construirCaminhoAipRecurso,
	construirFicheiroAipGuardado,
	exportarFicheirosAip,
	lerEntradasAip,
	resolverCaminhoAipRecurso,
	reporFicheirosAip,
} = require('../oais/aipStorage')

test('constrói e resolve caminhos AIP corretamente', () => {
	const base = '/tmp/aip'
	const recurso = { _id: 'abc123' }
	assert.equal(construirCaminhoAipRecurso(base, 'abc123'), path.resolve('/tmp/aip/abc123'))
	assert.equal(resolverCaminhoAipRecurso(recurso, base), path.resolve('/tmp/aip/abc123'))
	assert.equal(
		resolverCaminhoAipRecurso({ _id: 'x', aipPath: ' /tmp/custom/path ' }, base),
		path.resolve('/tmp/custom/path')
	)
})

test('constrói metadados do ficheiro sip guardado', () => {
	const ficheiro = construirFicheiroAipGuardado({
		caminhoAipRecurso: '/tmp/aip/recurso-1',
		nomeOriginal: 'recurso.zip',
		mimeType: 'application/zip',
		tamanho: 123,
	})

	assert.deepEqual(ficheiro, {
		originalName: 'recurso.zip',
		storageName: 'sip.zip',
		path: path.join('/tmp/aip/recurso-1', 'sip.zip'),
		mimeType: 'application/zip',
		size: 123,
	})
})

test('repõe, lê e exporta ficheiros AIP em diretório temporário', async () => {
	const raiz = await fsp.mkdtemp(path.join(os.tmpdir(), 'ew2026-aip-'))

	try {
		const caminhoAip = await reporFicheirosAip({
			pastaAip: raiz,
			recursoId: 'recurso-1',
			files: [
				{ path: 'bag/manifest.json', contentBase64: Buffer.from('{"ok":true}').toString('base64') },
				{ path: 'bag/data/ficheiro.txt', contentBase64: Buffer.from('conteudo').toString('base64') },
			],
		})

		assert.equal(caminhoAip, path.resolve(path.join(raiz, 'recurso-1')))

		const entradas = await lerEntradasAip({ _id: 'recurso-1' }, raiz)
		const caminhos = entradas.map((entrada) => entrada.caminho).sort()
		assert.deepEqual(caminhos, ['bag/data/ficheiro.txt', 'bag/manifest.json'])

		const exportado = await exportarFicheirosAip({ _id: 'recurso-1' }, raiz)
		assert.equal(exportado.resourceId, 'recurso-1')
		assert.equal(exportado.files.length, 2)
		assert.ok(exportado.files.some((ficheiro) => ficheiro.path === 'bag/manifest.json'))
		assert.ok(exportado.files.some((ficheiro) => ficheiro.path === 'bag/data/ficheiro.txt'))
	} finally {
		await fsp.rm(raiz, { recursive: true, force: true })
	}
})

test('rejeita reposição com caminho relativo inseguro', async () => {
	const raiz = await fsp.mkdtemp(path.join(os.tmpdir(), 'ew2026-aip-'))

	try {
		await assert.rejects(
			() => reporFicheirosAip({
				pastaAip: raiz,
				recursoId: 'recurso-2',
				files: [{ path: '../fora.txt', contentBase64: Buffer.from('x').toString('base64') }],
			}),
			/caminho relativo AIP inválido/
		)
	} finally {
		await fsp.rm(raiz, { recursive: true, force: true })
	}
})