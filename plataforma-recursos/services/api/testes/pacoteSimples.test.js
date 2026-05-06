const test = require('node:test')
const assert = require('node:assert/strict')
const JSZip = require('jszip')

const { construirSipSimples } = require('../oais/ingest/pacoteSimples')

test('constrói um SIP simples com estrutura BagIt e ficheiros normalizados', async () => {
	const pacote = await construirSipSimples({
		body: {
			tipo: 'artigo',
			titulo: 'Recurso de teste',
			visibilidade: 'publico',
			hashtags: 'ew2026, teste',
		},
		ficheiros: [
			{
				originalname: 'Ficha 1.pdf',
				mimetype: 'application/pdf',
				size: 5,
				buffer: Buffer.from('abcde'),
			},
			{
				originalname: 'Ficha 1.pdf',
				mimetype: 'application/pdf',
				size: 3,
				buffer: Buffer.from('xyz'),
			},
		],
	})

	assert.equal(pacote.ok, true)
	assert.ok(Buffer.isBuffer(pacote.zipBuffer))
	assert.equal(pacote.metadados.resource.titulo, 'Recurso de teste')
	assert.deepEqual(pacote.metadados.resource.hashtags, ['ew2026', 'teste'])

	const zip = await JSZip.loadAsync(pacote.zipBuffer)
	const nomes = Object.keys(zip.files).sort()

	assert.ok(nomes.includes('bagit.txt'))
	assert.ok(nomes.includes('manifest.json'))
	assert.ok(nomes.includes('checksums.txt'))
	assert.ok(nomes.includes('data/ficheiros/Ficha 1.pdf'))
	assert.ok(nomes.includes('data/ficheiros/Ficha 1-2.pdf'))

	const manifesto = JSON.parse(await zip.file('manifest.json').async('string'))
	assert.equal(manifesto.titulo, 'Recurso de teste')
	assert.equal(manifesto.tipo, 'artigo')
	assert.equal(manifesto.files.length, 2)

	const checksums = await zip.file('checksums.txt').async('string')
	assert.match(checksums, /data\/ficheiros\/Ficha 1\.pdf/)
	assert.match(checksums, /data\/ficheiros\/Ficha 1-2\.pdf/)
})

test('falha quando a submissão simples não tem ficheiros', async () => {
	const pacote = await construirSipSimples({
		body: {
			tipo: 'artigo',
			titulo: 'Sem anexos',
		},
		ficheiros: [],
	})

	assert.equal(pacote.ok, false)
	assert.match(pacote.errors[0].message, /pelo menos um ficheiro/i)
})