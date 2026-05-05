const path = require('path')
const multer = require('multer')

const { jsonError } = require('../lib/http')

function normalizeAllowedExtensions(extensions = []) {
	return new Set(
		extensions
			.map((extension) => String(extension || '').trim().toLowerCase())
			.filter(Boolean)
			.map((extension) => (extension.startsWith('.') ? extension : `.${extension}`))
	)
}

function normalizeAllowedMimeTypes(mimeTypes = []) {
	return new Set(
		mimeTypes
			.map((mimeType) => String(mimeType || '').trim().toLowerCase())
			.filter(Boolean)
	)
}

function fileMatchesConstraints(file, { allowedExtensions, allowedMimeTypes }) {
	const extension = path.extname(String(file?.originalname || '')).toLowerCase()
	const mimeType = String(file?.mimetype || '').trim().toLowerCase()

	const extensionOk = !allowedExtensions.size || allowedExtensions.has(extension)
	const mimeTypeOk = !allowedMimeTypes.size || allowedMimeTypes.has(mimeType)

	return extensionOk || mimeTypeOk
}

function createSingleMemoryUpload({
	fieldName,
	maxFileSizeBytes,
	maxFieldSizeBytes,
	allowedExtensions,
	allowedMimeTypes,
	errors,
}) {
	const normalizedExtensions = normalizeAllowedExtensions(allowedExtensions)
	const normalizedMimeTypes = normalizeAllowedMimeTypes(allowedMimeTypes)

	const upload = multer({
		storage: multer.memoryStorage(),
		limits: {
			fileSize: maxFileSizeBytes,
			fieldSize: maxFieldSizeBytes,
		},
		fileFilter: (req, file, cb) => {
			if (fileMatchesConstraints(file, {
				allowedExtensions: normalizedExtensions,
				allowedMimeTypes: normalizedMimeTypes,
			})) {
				return cb(null, true)
			}

			const err = new Error(errors.invalidType.message)
			err.code = errors.invalidType.code
			return cb(err)
		},
	})

	return (req, res, next) => {
		upload.single(fieldName)(req, res, (err) => {
			if (!err) return next()

			if (err.code === 'LIMIT_FILE_SIZE') {
				return jsonError(res, 400, errors.fileTooLarge)
			}

			if (err.code === 'LIMIT_FIELD_VALUE' || err.code === 'LIMIT_FIELD_SIZE') {
				return jsonError(res, 400, errors.fieldTooLarge)
			}

			if (err.code === errors.invalidType.code) {
				return jsonError(res, 400, errors.invalidType)
			}

			if (err.code === 'LIMIT_UNEXPECTED_FILE') {
				return jsonError(res, 400, {
					code: 'UNEXPECTED_FILE_FIELD',
					message: `campo de ficheiro inesperado; usa "${fieldName}"`,
				})
			}

			return next(err)
		})
	}
}

function createMultipleMemoryUpload({
	fieldName,
	maxFiles = 10,
	maxFileSizeBytes,
	maxFieldSizeBytes,
	allowedExtensions,
	allowedMimeTypes,
	errors,
}) {
	const normalizedExtensions = normalizeAllowedExtensions(allowedExtensions)
	const normalizedMimeTypes = normalizeAllowedMimeTypes(allowedMimeTypes)

	const upload = multer({
		storage: multer.memoryStorage(),
		limits: {
			files: maxFiles,
			fileSize: maxFileSizeBytes,
			fieldSize: maxFieldSizeBytes,
		},
		fileFilter: (req, file, cb) => {
			if (fileMatchesConstraints(file, {
				allowedExtensions: normalizedExtensions,
				allowedMimeTypes: normalizedMimeTypes,
			})) {
				return cb(null, true)
			}

			const err = new Error(errors.invalidType.message)
			err.code = errors.invalidType.code
			return cb(err)
		},
	})

	return (req, res, next) => {
		upload.array(fieldName, maxFiles)(req, res, (err) => {
			if (!err) return next()

			if (err.code === 'LIMIT_FILE_SIZE') {
				return jsonError(res, 400, errors.fileTooLarge)
			}

			if (err.code === 'LIMIT_FIELD_VALUE' || err.code === 'LIMIT_FIELD_SIZE') {
				return jsonError(res, 400, errors.fieldTooLarge)
			}

			if (err.code === 'LIMIT_FILE_COUNT') {
				return jsonError(res, 400, errors.tooManyFiles)
			}

			if (err.code === errors.invalidType.code) {
				return jsonError(res, 400, errors.invalidType)
			}

			if (err.code === 'LIMIT_UNEXPECTED_FILE') {
				return jsonError(res, 400, {
					code: 'UNEXPECTED_FILE_FIELD',
					message: `campo de ficheiro inesperado; usa "${fieldName}"`,
				})
			}

			return next(err)
		})
	}
}

module.exports = {
	createSingleMemoryUpload,
	createMultipleMemoryUpload,
}
