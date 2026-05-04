const mongoose = require('mongoose')

const ValidationLayerSchema = new mongoose.Schema(
	{
		ok: { type: Boolean, required: true },
		detalhes: { type: String, default: '' },
	},
	{ _id: false, strict: false }
)

const AipSchema = new mongoose.Schema(
	{
		sipId: { type: String, required: true, unique: true, index: true },
		recursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', default: null, index: true },
		status: { type: String, enum: ['ok', 'erro'], required: true, index: true },
		dataIngestao: { type: Date, default: () => new Date(), index: true },
		produtor: { type: String, default: null, index: true },
		manifesto: { type: Object, default: null },
		validacoes: {
			estrutura: { type: ValidationLayerSchema, required: true },
			metadados: { type: ValidationLayerSchema, required: true },
			seguranca: { type: ValidationLayerSchema, required: true },
			consistencia: { type: ValidationLayerSchema, required: true },
		},
		storageLocal: { type: String, default: null },
		relatorio: {
			dataValidacao: { type: Date, default: () => new Date() },
			erros: { type: [String], default: [] },
			avisos: { type: [String], default: [] },
		},
		checksumSIP: { type: String, required: true, index: true },
		downloadCount: { type: Number, default: 0, min: 0 },
	},
	{ versionKey: false }
)

module.exports = mongoose.model('Aip', AipSchema)
