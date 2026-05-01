const express = require('express')

const { ingestSipZip } = require('./sip')
const { construirSipSimples } = require('./pacoteSimples')
const Resource = require('../../models/Resource')
const { requireLevel } = require('../../middleware/auth')
const { config } = require('../../lib/config')
const { jsonError } = require('../../lib/http')
const { publishNews } = require('../../lib/newsPublisher')
const { publishTop3NewsIfChanged } = require('../../lib/systemNewsJob')
const { createMultipleMemoryUpload, createSingleMemoryUpload } = require('../../lib/upload')

const router = express.Router()
const uploadSip = createSingleMemoryUpload({
	fieldName: 'sip',
	maxFileSizeBytes: config.oais.maxSipFileSizeBytes,
	allowedExtensions: ['.zip'],
	allowedMimeTypes: ['application/zip', 'application/x-zip-compressed'],
	errors: {
		fileTooLarge: {
			code: 'SIP_FILE_TOO_LARGE',
			message: 'ficheiro SIP excede o tamanho máximo suportado pela API',
		},
		fieldTooLarge: {
			code: 'SIP_FIELDS_TOO_LARGE',
			message: 'campos do pedido excedem o tamanho suportado pela API',
		},
		invalidType: {
			code: 'INVALID_SIP_FILE',
			message: 'o ficheiro SIP tem de ser um ZIP',
		},
	},
})
const uploadSubmissaoSimples = createMultipleMemoryUpload({
	fieldName: 'ficheiros',
	maxFiles: 20,
	maxFileSizeBytes: config.oais.maxSipFileSizeBytes,
	maxFieldSizeBytes: 2 * 1024 * 1024,
	allowedExtensions: [],
	allowedMimeTypes: [],
	errors: {
		fileTooLarge: {
			code: 'FICHEIRO_RECURSO_DEMASIADO_GRANDE',
			message: 'um dos ficheiros do recurso excede o tamanho máximo suportado pela API',
		},
		fieldTooLarge: {
			code: 'METADADOS_DEMASIADO_GRANDES',
			message: 'os metadados do recurso excedem o tamanho suportado pela API',
		},
		tooManyFiles: {
			code: 'FICHEIROS_DEMAIS',
			message: 'a submissão simples aceita no máximo 20 ficheiros',
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
		const titulo = resource?.metadata?.resource?.titulo || 'recurso sem titulo'
		const producerName = req.user?.nome || req.user?.sub || 'produtor'

		await publishNews({
			tipo: 'system',
			eventType: 'system.new_submission',
			dedupeKey: `system.new_submission:${resourceId}`,
			titulo: 'Nova submissao de recurso',
			conteudo: `${producerName} submeteu o recurso \"${titulo}\".`,
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

// POST /api/oais/ingest
// Só produtores e admins podem submeter recursos.
// O produtor fica registado no metadata guardado.
router.post(
	'/ingest',
	requireLevel('produtor'),
	uploadSip,
	async (req, res) => {
		if (!req.file) {
			return jsonError(res, 400, {
				code: 'MISSING_FILE',
				message: 'Ficheiro SIP (ZIP) em falta',
				details: [{ code: 'MISSING_FILE', message: 'Ficheiro SIP (ZIP) em falta' }],
			})
		}

		const aipDir = config.storage.aipDir

		// Injetar o produtor no resultado para ser guardado pelo sip.js
		const result = await ingestSipZip({
			zipBuffer: req.file.buffer,
			aipDir,
			producerId: req.user.sub,
			uploadedFile: {
				originalName: req.file.originalname,
				mimeType: req.file.mimetype,
				size: req.file.size,
			},
		})

		if (!result.ok) {
			return jsonError(res, 422, {
				code: 'INVALID_SIP',
				message: 'SIP inválido',
				details: result.errors,
			})
		}

		await publicarNoticiasDepoisDaSubmissao(req, result.resourceId)

		res.status(201).json({ ok: true, resourceId: result.resourceId })
	}
)

async function receberSubmissaoSimples(req, res) {
	const tamanhoTotal = (req.files || []).reduce((soma, ficheiro) => soma + Number(ficheiro.size || 0), 0)
	if (tamanhoTotal > config.oais.maxSipFileSizeBytes) {
		return jsonError(res, 400, {
			code: 'SUBMISSAO_SIMPLES_DEMASIADO_GRANDE',
			message: 'o conjunto de ficheiros excede o tamanho máximo suportado pela API',
		})
	}

	const pacote = await construirSipSimples({
		body: req.body,
		ficheiros: req.files,
	})

	if (!pacote.ok) {
		return jsonError(res, 422, {
			code: 'SUBMISSAO_SIMPLES_INVALIDA',
			message: 'submissão simples inválida',
			details: pacote.errors,
		})
	}

	const result = await ingestSipZip({
		zipBuffer: pacote.zipBuffer,
		aipDir: config.storage.aipDir,
		producerId: req.user.sub,
		uploadedFile: {
			originalName: pacote.nomeOriginal,
			mimeType: 'application/zip',
			size: pacote.zipBuffer.length,
		},
	})

	if (!result.ok) {
		return jsonError(res, 422, {
			code: 'INVALID_SIP_GENERATED',
			message: 'o SIP gerado automaticamente não passou na validação',
			details: result.errors,
		})
	}

	await publicarNoticiasDepoisDaSubmissao(req, result.resourceId)

	res.status(201).json({
		ok: true,
		resourceId: result.resourceId,
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
