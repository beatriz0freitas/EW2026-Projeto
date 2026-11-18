# Índice de Evidências Técnicas (TASK-19)



**Repositório público:** https://github.com/beatriz0freitas/EW2026-Projeto (branch `beatriz`)
**Última atualização do dossiê:** 18/11/2026, commit `aff84a4c8dc599e54cd4911dbf0db2ed4d560e25`

Este índice mapeia cada área de competência para evidência técnica verificável:
commits públicos, execuções de GitHub Actions, testes automatizados e documentos
de medições. Todos os links são públicos e auditáveis. Os números indicados foram
confirmados localmente na data do dossiê (70 testes da API e 196 do serviço de IA aprovados).

---

## 1. Correspondência requisito-a-requisito

### Requisitos Mínimos

#### "Deployment de LLMs locais"

| Item | Evidência |
| :--- | :--- |
| Ollama integrado no Docker Compose com volume persistente (`ollama_models`), rede interna sem portas públicas, modelos `llama3.2:1b` e `nomic-embed-text` | Commit [d58c4cc](https://github.com/beatriz0freitas/EW2026-Projeto/commit/d58c4cc64a159e013e9cc38f8afd2d442d1de5d7) (T05); `plataforma-recursos/docker-compose.yml`; `scripts/pull_models.sh` |
| Microserviço FastAPI (`services/ai`) em contentor, token interno obrigatório, `/health` com diagnóstico real do Ollama validado localmente a 12/11/2026 (200/401/403/503) | Commit [1f2cf25](https://github.com/beatriz0freitas/EW2026-Projeto/commit/1f2cf25343a747a138b424da8e6b5ae23391b246) (T07); [TASK07_VALIDATION.md](../TASK07_VALIDATION.md) |
| RAG com geração local forçada ao contexto recuperado, citações validadas e abstinência | Commit [6296e68](https://github.com/beatriz0freitas/EW2026-Projeto/commit/6296e68591bf70998a5cf64d9218a38d4ed38a8b) (T11); `services/ai/app/rag.py` |

#### "Sistemas de recomendação baseados em LLMs"

| Item | Evidência |
| :--- | :--- |
| Recomendador em duas fases: candidatos FAISS + reranking estruturado por LLM local com justificação e `semantic_fallback` | Commit [24d68a3](https://github.com/beatriz0freitas/EW2026-Projeto/commit/24d68a349b17377cfe254b21d0440e13053e161b) (T12); `services/ai/app/recommender.py`; 196 testes do serviço (`tests/test_recommender.py`) |
| Benchmark honesto com métricas reais (inclui a limitação operacional do reranking no hardware, nunca escondida) | Commit [095424d](https://github.com/beatriz0freitas/EW2026-Projeto/commit/095424dc4717f23eb7a6d5adce06d898d4759a5e) (T15); [EVALUATION.md](../EVALUATION.md); [EXPERIMENTS.csv](../EXPERIMENTS.csv) |
| Explicação pedagógica do porquê de cada recomendação | Esquema `Recommendation` (`reason`, `relevanceScore`, `supportingChunkIds`) e jusante na interface (T17, commit [6d33d00](https://github.com/beatriz0freitas/EW2026-Projeto/commit/6d33d009c33d9ad163e074c41e397ee17019f375)) |

#### "RAGs"

| Item | Evidência |
| :--- | :--- |
| Pipeline RAG com contexto delimitado contra injeção, citações validadas em código e abstinência `insufficientEvidence` | Commit [6296e68](https://github.com/beatriz0freitas/EW2026-Projeto/commit/6296e68591bf70998a5cf64d9218a38d4ed38a8b); [SECURITY.md](../SECURITY.md) |
| Resposta com abstinência quando a evidência é insuficiente | Testes em `services/ai/tests/test_rag.py` (suite de 196 testes) e consulta fora de domínio Q15 do corpus |

#### "Pipelines CI/CD e GitHub Actions"

| Item | Evidência |
| :--- | :--- |
| CI com análise estática de workflows (actionlint, zizmor), auditoria de dependências, testes da API e do serviço de IA, validação Docker e builds | Commits [72525c9](https://github.com/beatriz0freitas/EW2026-Projeto/commit/72525c966dfcc4e29000144cb2dd2b0f34285847) (T02) e [c997e69](https://github.com/beatriz0freitas/EW2026-Projeto/commit/c997e6960a83fb1af5752a5b84a38cc38c23999b) (T03); `.github/workflows/ci.yml`; 23 execuções registadas, incluindo falhas intermédias durante o desenvolvimento (ex.: run #22, falha de permissões da cache do buildx num PR). A última execução, [run #23](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44338544524) (18/11/2026, no commit atual `aff84a4`), tem os cinco jobs aprovados |
| CD de publicação multi-arquitetura no GHCR com tags imutáveis `sha-<SHA>` e `latest` | Commit [b4621dd](https://github.com/beatriz0freitas/EW2026-Projeto/commit/b4621dd05d2ef24246d93590d3667e5cafa6e613) (T16); `.github/workflows/publish.yml`; [DEPLOYMENT_AND_ROLLBACK.md](../DEPLOYMENT_AND_ROLLBACK.md). **Nota honesta:** a execução remota desta pipeline ainda não ocorreu (requer push de tag `v*`); a validação foi estática (actionlint, zizmor) |
| Documentação OpenAPI dos endpoints `/api/ai/*` testável no Swagger UI | Commit [341c2a8](https://github.com/beatriz0freitas/EW2026-Projeto/commit/341c2a86739a053891d210a6e111b20bf4d1b9b6) (T18); `services/api/swagger.yaml` |

#### "Virtualização, containerização e provisionamento (Docker, Vagrant, Ansible)"

| Item | Evidência |
| :--- | :--- |
| Docker Compose multi-serviço (nginx, gateway, interface, api, auth, mongodb, ollama, ai) com redes isoladas e volumes | `plataforma-recursos/docker-compose.yml`; validação `docker compose config` e build de imagens no [job "Docker Infrastructure & Image Build" do run #18](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44295987766/job/134773024063) |
| IaC: Vagrantfile (ubuntu/jammy64, 4GB RAM, 2 vCPU, porta 16020) + playbook Ansible com role `ew_stack` (Docker, Compose, Ollama, modelos) | Commit [56c2aef](https://github.com/beatriz0freitas/EW2026-Projeto/commit/56c2aefabd3688d8073b5cee1343e73f8deb572b) (T04); `infra/provisioning/`; sintaxe validada com `ansible-playbook --syntax-check` |

#### Segurança cibernética

| Item | Evidência |
| :--- | :--- |
| Integração API Node ↔ microserviço AI com pré-filtragem de visibilidade (`allowed_ids`) e revalidação em profundidade | Commit [742d94d](https://github.com/beatriz0freitas/EW2026-Projeto/commit/742d94d1d85dd696241550540c2673d8c92c01dd) (T13); `services/api/controllers/aiController.js`, `lib/aiClient.js` |
| Suite adversarial (injeção de prompt, exploração de ACL, alucinações, indisponibilidade) | Commit [eab7def](https://github.com/beatriz0freitas/EW2026-Projeto/commit/eab7defccfab593b64084fd7200a2f373232a074) (T14); `services/api/testes/adversarialAi.test.js` (14 testes, dentro dos 70 da API); [SECURITY.md](../SECURITY.md) |

### Fatores de Preferência

#### "Análise estática e/ou dinâmica"

| Item | Evidência |
| :--- | :--- |
| Análise estática de workflows (actionlint) e segurança de cadeia de abastecimento (zizmor, persona auditor) | [job do run #18](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44295987766/job/134773024115); `.github/workflows/ci.yml` |
| Qualidade de código: `node --check`, ESLint style, npm audit, Ruff e Bandit no serviço Python | [jobs do run #18](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44295987766) |

#### "Clustering e FAISS"

| Item | Evidência |
| :--- | :--- |
| Índice FAISS `IndexFlatIP` com publicação atómica de geração e manifesto; reindexação incremental | Commits [2f09384](https://github.com/beatriz0freitas/EW2026-Projeto/commit/2f093842f8ef851da4308ee0a702b4f1f092d5e6) e [4c3d84e](https://github.com/beatriz0freitas/EW2026-Projeto/commit/4c3d84e1a12ca39d8b4fe3d4fbdce2a86e9f3afa) (T08); [INDEXING.md](../INDEXING.md) |
| Clustering `faiss.Clustering` (k-means) com palavras-chave e centroides | Commit [c9f45d9](https://github.com/beatriz0freitas/EW2026-Projeto/commit/c9f45d9f98f495524ed63ff2939c0e9a16bc841a) (T09); `services/ai/app/clustering.py`, `POST /api/ai/cluster` |
| Pesquisa vetorial com subíndice FAISS restrito a IDs autorizados | Commit [5cd79e3](https://github.com/beatriz0freitas/EW2026-Projeto/commit/5cd79e311a2762c2a9c142f55439ed7071abc784) (T10); `services/ai/app/retrieval.py` |

### Demo funcional e documentação de API (camada de entrega)

| Item | Evidência |
| :--- | :--- |
| Interface Pug: "Recomendações IA" e "Perguntar aos Recursos" com citações clicáveis e abstinência | Commit [6d33d00](https://github.com/beatriz0freitas/EW2026-Projeto/commit/6d33d009c33d9ad163e074c41e397ee17019f375) (T17); `services/interface/views/ai/`, `routes/ai.js` |
| Corpus sintético com proveniência, licenciamento e ground-truth (25 recursos, 15 queries, julgamentos 0–3) | Commit [5cfee82](https://github.com/beatriz0freitas/EW2026-Projeto/commit/5cfee82b208497334c772521da2ceddf241d8e9f) (T06); [DATASET.md](../DATASET.md) |

---

## 2. Evidência transversal (testes e integridade)

- **Suite API (Node):** 70 testes aprovados, incluindo 14 adversariais de segurança — ver [job do run #23](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44338544524/job/134921806610).
- **Suite AI (Python):** 196 testes aprovados sem Ollama nem downloads — ver [job do run #23](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44338544524/job/134921806343).
- **Baseline inicial (46/46 testes, hardware, commit base):** [BASELINE.md](../BASELINE.md) (T01).
- **Execuções de CI:** 23 execuções registadas desde 12/11/2026 (run #1) até 18/11/2026 (run #23, commit HEAD `aff84a4`). O histórico não é "all green": existem cancelamentos e pelo menos uma falha intermédia (run #22, export de cache do buildx sem scope de escrita), corrigida em `aff84a4`; a última execução está totalmente verde.
- **Integridade da branch:** histórico da branch `beatriz` publicado sem reescritas; o commit base antes das extensões (`b9a4784`) está auditado em [BASELINE.md](../BASELINE.md).

## 3. Pendências e limitações declaradas

Para conformidade com exigência de honestidade do dossiê:

1. **Publish GHCR (T16)** não foi executado remotamente; workflow válido e com rollback documentado. Indicadores de execução: nenhum pacote publicado até 18/11/2026.
2. **Navegação ao vivo da interface (T17)** em `localhost:16020` não foi gravada; a submissão funcional foi verificada por testes de controller/HTTP stubados e render smoke dos templates.
3. **Reranking LLM (T12/T15):** no benchmark de 16/11/2026, 0/15 respostas LLM foram aceites dentro do timeout de 60 s (CPU) com 15 candidatos por prompt; o recomendador degrada para `semantic_fallback`. Em 18/11/2026 o pool por prompt foi reduzido (top 5, excertos de 200 carateres) e o benchmark foi repetido: **3/15 respostas aceites** (primeira reordenação LLM aceite), zero timeouts, latência p95 de ~45 s; relatório completo em [EVALUATION.md](../EVALUATION.md).
4. **Reconciliação do roteiro:** os módulos de T09 a T11 (clustering, retrieval, RAG) têm commits, testes e CI verdes; os estados no roteiro foram reconciliados a 18/11/2026.
5. **Provisionamento Vagrant/Ansible (T04)** validado por sintaxe; não há gravação de uma VM completa provisionada de ponta a ponta.
6. **Extração de PDFs (T20):** `pdf_extractor.py` é um módulo de ingestão offline (sanitização, chunks 500/100, offsets) validado por 20 testes unitários com PDFs e ZIPs sintéticos; ainda não está ligado ao índice FAISS operacional nem foi exercitado contra um pacote AIP real gerado pela plataforma.

## 4. Como conferir

```bash
git clone https://github.com/beatriz0freitas/EW2026-Projeto
cd EW2026-Projeto && git checkout beatriz
cd plataforma-recursos/services/api && npm ci && npm test
cd ../ai && pip install -r requirements-dev.txt && python -m pytest -q
```

Execuções remotas: https://github.com/beatriz0freitas/EW2026-Projeto/actions
