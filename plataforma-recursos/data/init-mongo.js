const fs = require('fs');
const dbName = process.env.MONGO_INITDB_DATABASE || 'ew2026';
const fixturesPath = '/docker-entrypoint-initdb.d/fixtures.json';

try {
	const targetDb = db.getSiblingDB(dbName);
	const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
	const users = Array.isArray(fixtures.users) ? fixtures.users : [];

	if (users.length === 0) {
		print('Sem utilizadores para popular.');
	} else if (targetDb.users.countDocuments() > 0) {
		// Só popula se a coleção estiver vazia
		print('Coleção users já populada. Seed ignorado.');
	} else {
		// Inserir utilizadores de teste
		const usersComDatas = users.map((user) => ({
			...user,
			data_registo: user.data_registo || new Date(),
			ultimo_acesso: user.ultimo_acesso || new Date(),
		}));

		targetDb.users.insertMany(usersComDatas);
		print(`Seed concluído: ${users.length} utilizadores inseridos.`);

		// Criar índice principal
		targetDb.users.createIndex({ email: 1 }, { unique: true });

		// Listar utilizadores criados
		print('\nUtilizadores de teste:');
		targetDb.users.find({}).forEach((user) => {
			print(` - ${user.email} (${user.role})`);
		});
	}
} catch (err) {
	print(`Erro ao executar seed: ${err.message}`);
}
