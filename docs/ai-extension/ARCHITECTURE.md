# Arquitetura do Microserviço de IA (TASK-07)

O serviço `plataforma-recursos/services/ai` é um microserviço FastAPI
interno, sem porta publicada no host pelo Docker Compose. A rede bridge é partilhada com os outros serviços e não bloqueia egress. A implementação desta
tarefa fornece a fundação operacional para as tarefas funcionais seguintes:

- contratos Pydantic estritos para pesquisa, RAG, recomendação e clustering;
- `GET /live`, uma verificação de processo sem dependências externas;
- `GET /health`, protegido por `X-Internal-Token`;
- cliente de diagnóstico Ollama sem downloads nem inferência.

## Diagnóstico do Ollama

O endpoint `/health` consulta `/api/tags` para modelos instalados e `/api/ps`
para modelos atualmente carregados. Um modelo não precisa estar carregado para
o serviço estar pronto: ambos os modelos configurados precisam apenas estar
instalados. Falhas transitórias de transporte e respostas HTTP transitórias
usam retries limitados; timeouts, redirecionamentos, proxies implícitos e
detalhes de erros upstream não são expostos.

O endpoint devolve:

- `200` e `status: "ok"` quando o Ollama é alcançável e os dois modelos estão
  instalados;
- `503` com `MODELS_MISSING` quando faltam modelos;
- `503` com `OLLAMA_UNAVAILABLE` quando o diagnóstico não pode ser concluído.

`/live` continua disponível quando o Ollama está indisponível, permitindo que
o orquestrador distinga falha do processo de indisponibilidade da dependência.

## Segurança e operação

O token interno é obrigatório no arranque e comparado com
`secrets.compare_digest`. Os contratos rejeitam campos adicionais, entradas
não estritas, IDs malformados e listas de IDs duplicadas. O container runtime
não inclui dependências de desenvolvimento, executa como utilizador sem
privilégios e mantém os dados de índice em `/app/data`.

O indexador da TASK-08 normaliza os campos educativos de forma determinística,
gera vetores L2-normalizados para `faiss.IndexFlatIP` e mantém um manifesto
com `resourceId`, `chunkId`, título, tema, hash do texto e visibilidade.
Reindexações preservam vetores de recursos inalterados e remoções publicam uma
nova geração sem chamar o Ollama. Só são indexados metadados explicitamente públicos; o manifesto identifica o modelo por digest e a leitura valida a geração inteira. Ver [INDEXING.md](INDEXING.md) para os comandos, garantias e limites de integração. Recuperação, RAG, recomendação e clustering
continuam separados do health check. A TASK-09 usa `faiss.Clustering` em modo
spherical k-means sobre a geração publicada e filtra primeiro os `allowed_ids`,
devolvendo grupos, centroides e palavras-chave através de `POST /cluster`.
Esta separação evita que o health check descarregue modelos ou execute
operações de inferência dispendiosas.

## Validação

O CI instala as dependências de desenvolvimento e executa Ruff, Bandit e
pytest sem Ollama nem download de modelos. Também constrói a imagem runtime e
verifica `/live` e a rejeição de `/health` sem token numa rede isolada. A validação local com Ollama real confirmou 200 com os modelos instalados e 503 com a dependência indisponível; ver [TASK07_VALIDATION.md](TASK07_VALIDATION.md).
