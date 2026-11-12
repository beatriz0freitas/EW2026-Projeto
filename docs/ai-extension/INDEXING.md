# TASK-08 — indexação pública incremental com FAISS

O indexador aceita o formato real `Resource`: `_id` e `metadata.resource`.
Só entram os campos educativos `titulo`, `tema`, `descricao` e `hashtags`,
com `visibilidade` explicitamente igual a `publico`. Recursos privados ou com
visibilidade ausente/desconhecida não chegam ao embedder. Caminhos AIP,
ficheiros preservados, produtor, ratings e outros campos não são indexados.

## Representação e embeddings

O texto é JSON canónico UTF-8 com normalização Unicode NFC, espaços uniformes
e hashtags ordenadas e sem duplicados. Os acentos são preservados. Cada
recurso tem um chunk cujo ID combina o ObjectId e o hash do texto normalizado.

O cliente usa Ollama local em `POST /api/embed`, em lotes de até 16 textos por
omissão. `truncate: false` impede a truncagem silenciosa de descrições acima do
contexto do modelo. O timeout de inferência é independente do diagnóstico:
`OLLAMA_EMBEDDING_TIMEOUT_SECONDS=120`, configurável até 600 segundos.
Não há retries de inferência que possam duplicar trabalho após um timeout.
Ver [contrato oficial de embeddings](https://docs.ollama.com/api/embed).

Os vetores são convertidos para float32 contíguo após normalização L2 robusta.
Rejeitam-se vetores vazios, nulos, não numéricos, não finitos, número de vetores
incorreto e dimensões incompatíveis. `faiss.IndexFlatIP` representa similaridade
de cosseno quando os vetores de documentos **e de consultas** estão normalizados;
a normalização das queries será exigida na TASK-10.
Ver [métricas do FAISS](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances).

O manifesto regista nome/digest do modelo, versão da normalização, dimensão,
métrica, checksum do índice e a posição de cada recurso com título, tema,
texto, hash, chunk e visibilidade. A versão da geração inclui os bytes do índice;
textos iguais com modelos/vetores diferentes não partilham a mesma versão.
O digest instalado é consultado antes e depois de gerar embeddings. Operadores
não devem substituir modelos durante uma execução de indexação.

## Operações e consistência

- `build(resources)` / CLI `sync`: snapshot **completo** e autorizado. Recursos
  ausentes são removidos; os inalterados reutilizam os vetores.
- `reindex(resources, remove_ids=())` / CLI `upsert`: atualização parcial.
  Recursos não mencionados mantêm-se. Entradas privatizadas são revogadas.
- `remove(ids)`: remoção idempotente, inclusive do último vetor e de IDs já
  ausentes. Não necessita de Ollama disponível.

Uma atualização válida remove primeiro recursos eliminados, privados ou com
texto desatualizado. Só depois faz chamadas ao modelo. Se estas falharem, a
geração publicada contém apenas os recursos preservados, sem repor conteúdo
revogado. Isto favorece segurança sobre disponibilidade. Uma mudança de modelo
exige snapshot completo para recalcular todos os embeddings; uma atualização
parcial não mistura espaços vetoriais diferentes.

Writers usam `flock` POSIX durante toda a operação, evitando perda de atualizações
entre processos. O alvo é Linux/Docker e um volume local com renames atómicos;
não se assume que Windows nativo ou qualquer filesystem de rede tenha a mesma
semântica.

```text
FAISS_INDEX_PATH/
  .writer.lock
  current.json                      # único ponto de publicação
  generations/<sha256>/
    index.faiss
    manifest.json
```

Os ficheiros são escritos e sincronizados numa diretoria temporária, publicada
como geração imutável. Um ficheiro temporário exclusivo substitui `current.json`
por rename atómico; ficheiros e diretorias são sincronizados com `fsync`.
Republicar uma geração existente atualiza sempre o ponteiro, incluindo após
uma falha entre escrita da geração e publicação do ponteiro.

`load_generation` lê o ponteiro uma vez e verifica caminhos, checksums, dimensão,
mapeamento e normalização. O clustering existente passa a utilizar este leitor.
O volume é de confiança: checksums detetam corrupção, não autenticam ficheiros
fornecidos por um atacante. Nunca carregar índices enviados por utilizadores;
o próprio [FAISS alerta para os riscos da leitura de índices não confiáveis](https://github.com/facebookresearch/faiss/wiki/Index-IO,-cloning-and-hyper-parameter-tuning).

Gerações antigas permanecem no volume para leitores que já as abriram; não há
recolha automática nem apagamento físico histórico nesta tarefa. Nenhuma rota
serve versões antigas e não se deve restaurá-las sem revalidar as permissões.
O formato legado anterior a `schemaVersion: 2` é rejeitado; reconstruir numa
nova diretoria/volume usando um snapshot atual, em vez de reutilizar vetores
sem identificação de modelo.

## Executar

Em `plataforma-recursos/`, configurar `.env`, iniciar Ollama e descarregar os
modelos conforme [TASK07_VALIDATION.md](TASK07_VALIDATION.md). O corpus de
exemplo é montado apenas para leitura. Estes comandos destinam-se ao índice
de demonstração: `sync` substitui o conjunto completo de recursos desse índice.

```bash
docker compose run --rm --no-deps \
  -v "$PWD/data/ai-fixtures:/fixtures:ro" ai \
  python -m app.index_resources sync /fixtures/resources.json

# Repetir não gera embeddings para texto/modelo inalterados.
docker compose run --rm --no-deps \
  -v "$PWD/data/ai-fixtures:/fixtures:ro" ai \
  python -m app.index_resources sync /fixtures/resources.json

# Atualizar apenas os recursos presentes num snapshot parcial confiável.
docker compose run --rm --no-deps \
  -v "$PWD/data/ai-fixtures:/fixtures:ro" ai \
  python -m app.index_resources upsert /fixtures/resources.json

# Remover um recurso, sem chamadas ao Ollama.
docker compose run --rm --no-deps ai \
  python -m app.index_resources remove 663e00000000000000000001
```

Para um destino separado, usar `--index-path /app/data/outro-indice` **antes**
do subcomando. O volume `ai_data` é gravável pelo UID 10001 em volumes novos.
Volumes antigos com ownership de root precisam de correção explícita de
permissões pelo operador; não se alteram permissões recursivamente no arranque.

A CLI devolve apenas versão, contagem, dimensão e modelo. Não expõe documentos,
caminhos nem segredos em mensagens de erro. Um snapshot não é um canal público
de upload: tem de vir de uma fonte autorizada.

## Testes e evidência local

A partir de `plataforma-recursos/`:

```bash
docker build --target test -t ew2026-ai:test services/ai
docker run --rm --network none -e OMP_NUM_THREADS=1 \
  -v "$PWD/data/ai-fixtures:/fixtures:ro" ew2026-ai:test
docker run --rm --network none ew2026-ai:test ruff check --no-cache app tests
docker run --rm --network none ew2026-ai:test bandit -q -r app
```

Sem o corpus montado, o teste específico do fixture é explicitamente ignorado;
no checkout do CI encontra o ficheiro versionado. Os restantes testes não
precisam de rede, modelos nem GPU. A suite cobre privatização, mudanças de
modelo, falhas de embeddings, dimensões/NaN/zero, snapshot vazio, remoção do
último vetor, corrupção, publicação interrompida, retorno a gerações existentes
e escritas concorrentes.

Execução real em 12/11/2026: Python 3.11.18, FAISS 1.16.0, Ollama 0.6.0,
CPU, `OMP_NUM_THREADS=1`, corpus com 25 recursos (21 públicos, 4 privados).

| Verificação | Resultado observado |
| --- | --- |
| Recursos indexados | 21; nenhum ID privado no manifesto |
| Dimensão | 768; todos os vetores com norma L2 aproximadamente 1 |
| Indexação inicial | 7,429 s; 2 pedidos de embeddings (16 + 5 textos) |
| Segunda passagem | 0,006 s; mesma geração e 0 pedidos de embeddings |
| Alteração de uma descrição | 1 pedido, apenas para o recurso alterado |
| Privatização | 20 vetores restantes; sem embeddings adicionais |
| Remoção de todos os restantes | Índice vazio válido |
| CLI | `sync`, `upsert` e `remove` executados com modelo real |
| Suite de regressão | 142 testes aprovados; Ruff/Bandit aprovados |

Modelo observado:
`nomic-embed-text:latest@0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`.
Geração inicial:
`2f765a7b887d9a71548cef588676a52633bdde076fc6e1599d1daa463c2ba337`.
São medições de uma execução local, não médias, p95 nem métricas de qualidade
de recomendação. Reproduzir resultados semânticos exige preservar também o
modelo, o corpus e a configuração; não se promete igualdade bit a bit entre
hardware/versões diferentes.

## Limite de integração

A TASK-08 fornece os métodos e a CLI. Ainda não observa automaticamente MongoDB:
a ligação das alterações/remoções da API ao indexador pertence à TASK-13.
Nessa integração, uma falha de publicação de revogações deve bloquear respostas
potencialmente desatualizadas. A API deve calcular `allowed_ids` a partir do
estado atual e revalidar resultados. O índice é derivado e nunca altera AIPs.
Pesquisa pública, geração RAG e recomendação continuam nas tarefas próprias.
