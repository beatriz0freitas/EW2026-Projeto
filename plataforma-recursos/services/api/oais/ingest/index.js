const express = require('express')

const { ingerirSipZip } = require('./sip')
const { construirSipSimples } = require('./pacoteSimples')
const Resource = require('../../models/Resource')
const { requireLevel } = require('../../middleware/auth')
const { config } = require('../../lib/config')
const { jsonError } = require('../../lib/http')
const { publishNews } = require('../../lib/newsPublisher')
const { publishTop3NewsIfChanged } = require('../../jobs/systemNews')
const { createMultipleMemoryUpload, createSingleMemoryUpload } = require('../../middleware/upload')

const router = express.Router()
const MAX_TAMANHO_FICHEIRO_PAYLOAD = 50 * 1024 * 1024

function responderErroIngestao(res, code, message, result) {
	return jsonError(res, 422, {
		code,
		message,
		categoria: result.categoria,
		details: result.errors,
		erros: result.errors?.map((erro) => erro.message),
		validacoes: result.validacoes,
		relatorio: result.relatorio,
	})
}

function criarFicheiroZipCarregado({ originalName, mimeType = 'application/zip', size }) {
	return {
		originalName,
		mimeType,
		size,
	}
}

const uploadSip = createSingleMemoryUpload({
	fieldName: 'sip',
	maxFileSizeBytes: config.oais.maxSipFileSizeBytes,
	allowedExtensions: ['.zip'],
	allowedMimeTypes: ['application/zip', 'application/x-zip-compressed'],
	errors: {
		fileTooLarge: {
			code: 'SIP_FILE_TOO_LARGE',
			message: 'o ficheiro preparado é demasiado grande',
		},
		fieldTooLarge: {
			code: 'SIP_FIELDS_TOO_LARGE',
			message: 'a informação enviada é demasiado grande',
		},
		invalidType: {
			code: 'INVALID_SIP_FILE',
			message: 'o ficheiro preparado tem de ser um ZIP',
		},
	},
})
const uploadSubmissaoSimples = createMultipleMemoryUpload({
	fieldName: 'ficheiros',
	maxFiles: 20,
	maxFileSizeBytes: MAX_TAMANHO_FICHEIRO_PAYLOAD,
	maxFieldSizeBytes: 2 * 1024 * 1024,
	allowedExtensions: [],
	allowedMimeTypes: [],
	errors: {
		fileTooLarge: {
			code: 'FICHEIRO_RECURSO_DEMASIADO_GRANDE',
			message: 'um dos ficheiros do recurso é demasiado grande',
		},
		fieldTooLarge: {
			code: 'METADADOS_DEMASIADO_GRANDES',
			message: 'a informação do recurso é demasiado grande',
		},
		tooManyFiles: {
			code: 'FICHEIROS_DEMAIS',
			message: 'podes enviar no máximo 20 ficheiros de cada vez',
		},
		invalidType: {
			code: 'TIPO_FICHEIRO_INVALIDO',
			message: 'um dos ficheiros do recurso tem um tipo não suportado',
		},
	},
})

async function publicarNoticiasDepoisDaSubmissao(req, resourceId) {
	try {
		const resource = await Resource.findById(resourceId).lean()
		if (resource?.metadata?.resource?.visibilidade === 'privado') return
		const titulo = resource?.metadata?.resource?.titulo || 'recurso sem titulo'
		const producerName = req.user?.nome || req.user?.sub || 'produtor'

		await publishNews({
			tipo: 'system',
			eventType: 'system.new_submission',
			dedupeKey: `system.new_submission:${resourceId}`,
			titulo: 'Novo recurso publicado',
			conteudo: `${producerName} publicou o recurso \"${titulo}\".`,
			createdBy: 'system',
			payload: {
				resourceId,
				producerId: req.user?.sub || null,
				producerName: req.user?.nome || null,
				title: titulo,
			},
		})
	} catch (newsErr) {
		console.error('[api][ingest] warning: could not publish new submission news:', newsErr)
	}

	publishTop3NewsIfChanged().catch((err) => {
		console.error('[api][ingest] warning: could not publish top3 news after ingest:', err)
	})
}

async function receberSip(req, res) {
	if (!req.file) {
		return jsonError(res, 400, {
			code: 'MISSING_FILE',
			message: 'Ficheiro ZIP preparado em falta',
			details: [{ code: 'MISSING_FILE', message: 'Ficheiro ZIP preparado em falta' }],
		})
	}

	const aipDir = config.storage.aipDir

	const result = await ingerirSipZip({
		zipBuffer: req.file.buffer,
		aipDir,
		producerId: req.user.sub,
		uploadedFile: criarFicheiroZipCarregado({
			originalName: req.file.originalname,
			mimeType: req.file.mimetype,
			size: req.file.size,
		}),
	})

	if (!result.ok) {
		return responderErroIngestao(res, 'INVALID_SIP', 'Não foi possível ler o ficheiro preparado', result)
	}

	await publicarNoticiasDepoisDaSubmissao(req, result.resourceId)

	res.status(201).json(result)
}

// POST /api/oais/ingest
// Só produtores e admins podem submeter recursos.
// O produtor fica registado no metadata guardado.
router.post('/ingest', requireLevel('produtor'), uploadSip, receberSip)

async function receberSubmissaoSimples(req, res) {
	const tamanhoTotal = (req.files || []).reduce((soma, ficheiro) => soma + Number(ficheiro.size || 0), 0)
	if (tamanhoTotal > config.oais.maxSipFileSizeBytes) {
		return jsonError(res, 400, {
			code: 'SUBMISSAO_SIMPLES_DEMASIADO_GRANDE',
			message: 'o conjunto de ficheiros é demasiado grande',
		})
	}

	const pacote = await construirSipSimples({
		body: req.body,
		ficheiros: req.files,
	})

	if (!pacote.ok) {
		return jsonError(res, 422, {
			code: 'SUBMISSAO_SIMPLES_INVALIDA',
			message: 'revê a informação do recurso',
			details: pacote.errors,
		})
	}

	const result = await ingerirSipZip({
		zipBuffer: pacote.zipBuffer,
		aipDir: config.storage.aipDir,
		producerId: req.user.sub,
		uploadedFile: criarFicheiroZipCarregado({
			originalName: pacote.nomeOriginal,
			size: pacote.zipBuffer.length,
		}),
	})

	if (!result.ok) {
		return responderErroIngestao(res, 'INVALID_SIP_GENERATED', 'não foi possível preparar os ficheiros automaticamente', result)
	}

	await publicarNoticiasDepoisDaSubmissao(req, result.resourceId)

	res.status(201).json({
		...result,
		metadata: pacote.metadados,
	})
}

// POST /api/oais/ingest/simples
// Recebe campos e ficheiros soltos, constrói um SIP BagIt e usa o mesmo ingest.
router.post(
	'/ingest/simples',
	requireLevel('produtor'),
	uploadSubmissaoSimples,
	receberSubmissaoSimples
)

module.exports = router
