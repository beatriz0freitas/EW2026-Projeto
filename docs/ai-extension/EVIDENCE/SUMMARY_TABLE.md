# Resumo Executivo de Evidências (TASK-19)

**Candidata:** Ana Beatriz Freitas
**Candidatura:** Bolsa de Investigação INESC TEC — Projeto BringTrust (Edital AE2026-0337)
**Repositório público:** https://github.com/beatriz0freitas/EW2026-Projeto (branch `beatriz`, commit HEAD `341c2a8`)
**Data:** 18/11/2026

Este documento resume, requisito a requisito, o que foi construído e onde está
a evidência auditável. É desenhado para leitura rápida na avaliação curricular
e para servir de anexo à candidatura. A formulação distingue sempre o que está
comprovado por execução (testes, CI, medições) do que está apenas documentado.

## Tabela de correspondência

| Requisito do edital | Contribuição | Evidência primária (URL pública) | Resultado verificável |
| :--- | :--- | :--- | :--- |
| Pipelines CI/CD e GitHub Actions | Workflow CI com análise estática de workflows (actionlint), auditoria zizmor, API audit, testes Node e Python, validação e build Docker | `.github/workflows/ci.yml` · [run #23](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44338544524) · [run #1](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/43264309090) | 23 execuções registadas entre 12/11 e 18/11/2026, com falhas intermédias corrigidas; os 5 jobs do run #23 aprovados |
| Containerização (Docker) | Ecossistema Compose de 8 serviços (nginx, gateway, interface, api, auth, mongodb, ollama, ai) com redes isoladas e volumes; build validado no CI | `plataforma-recursos/docker-compose.yml` · [job Docker do run #23](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44338544524/job/134921807449) | Build e validação de imagens verde no GitHub Actions |
| Virtualização e provisionamento (Vagrant, Ansible) | Vagrantfile ubuntu/jammy64 (4GB RAM, 2 vCPU) e playbook Ansible com role `ew_stack` (Docker, Compose, Ollama, modelos locais) | [commit 56c2aef](https://github.com/beatriz0freitas/EW2026-Projeto/commit/56c2aefabd3688d8073b5cee1343e73f8deb572b) · `infra/provisioning/` | Sintaxe validada com `ansible-playbook --syntax-check`; provisionamento documentado |
| Deployment de LLMs locais | Ollama em contentor com volumes persistentes e rede interna; microserviço FastAPI (`services/ai`) com contratos Pydantic estritos e `/health` autenticado | [commit d58c4cc](https://github.com/beatriz0freitas/EW2026-Projeto/commit/d58c4cc64a159e013e9cc38f8afd2d442d1de5d7) · [commit 1f2cf25](https://github.com/beatriz0freitas/EW2026-Projeto/commit/1f2cf25343a747a138b424da8e6b5ae23391b246) · [TASK07_VALIDATION.md](../TASK07_VALIDATION.md) | Validação real com Ollama 0.6.0: 200/401/403/503 e liveness independente (12/11/2026) |
| RAGs | Pipeline RAG com contexto delimitado contra injeção, citações validadas em código, abstinência explícita | [commit 6296e68](https://github.com/beatriz0freitas/EW2026-Projeto/commit/6296e68591bf70998a5cf64d9218a38d4ed38a8b) · `services/ai/app/rag.py` · [SECURITY.md](../SECURITY.md) | Testes de abstinência e citações aprovados (suite de 196) |
| Sistemas de recomendação com LLMs | Recomendador em duas fases: candidatos FAISS + reranking e justificação por LLM local, com fallback semântico | [commit 24d68a3](https://github.com/beatriz0freitas/EW2026-Projeto/commit/24d68a349b17377cfe254b21d0440e13053e161b) · `services/ai/app/recommender.py` | 196 testes do serviço verdes; fallback cobre falha do LLM |
| FAISS e clustering | Índice `IndexFlatIP` com publicação atómica e manifesto; clustering `faiss.Clustering` com centroides e palavras-chave; pesquisa por subíndice restrito a IDs autorizados | [commit 2f09384](https://github.com/beatriz0freitas/EW2026-Projeto/commit/2f093842f8ef851da4308ee0a702b4f1f092d5e6) · [commit c9f45d9](https://github.com/beatriz0freitas/EW2026-Projeto/commit/c9f45d9f98f495524ed63ff2939c0e9a16bc841a) · [commit 5cd79e3](https://github.com/beatriz0freitas/EW2026-Projeto/commit/5cd79e311a2762c2a9c142f55439ed7071abc784) · [INDEXING.md](../INDEXING.md) | Índice real gerado via Ollama (21 públicos, 768 dimensões); 196 testes verdes |
| Análise estática e segurança | actionlint + zizmor (persona auditor) sobre os workflows; Ruff + Bandit sobre o serviço Python; suites adversariais contra injeção de prompt e bypass de ACL | [job análise do run #18](https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44295987766/job/134773024115) · [commit eab7def](https://github.com/beatriz0freitas/EW2026-Projeto/commit/eab7defccfab593b64084fd7200a2f373232a074) | Suite API: 70 testes verdes, incluindo 14 adversariais; zizmor sem findings |
| Rigor experimental | Benchmark reproducível lexical vs FAISS vs reranking LLM, com métricas Precision@5, nDCG@5, latência p50/p95 e conformidade | [commit 095424d](https://github.com/beatriz0freitas/EW2026-Projeto/commit/095424dc4717f23eb7a6d5adce06d898d4759a5e) · [EVALUATION.md](../EVALUATION.md) · [EXPERIMENTS.csv](../EXPERIMENTS.csv) | FAISS melhorou Precision@5 de 0,3333→0,4400 e nDCG@5 de 0,7674→0,8073; limitações do reranking reportadas à medida, nunca escondidas |
| Segurança de integração (ACL) | Pré-filtragem de visibilidade no backend Node + revalidação em profundidade dos resultados da IA | [commit 742d94d](https://github.com/beatriz0freitas/EW2026-Projeto/commit/742d94d1d85dd696241550540c2673d8c92c01dd) · `services/api/controllers/aiController.js` | Testes adversariais sem violações de acesso |
| Entrega contínua (CD) | Workflow de publicação multi-arquitetura no GHCR com tags `sha-<SHA>` imutáveis e rollback documentado | [commit b4621dd](https://github.com/beatriz0freitas/EW2026-Projeto/commit/b4621dd05d2ef24246d93590d3667e5cafa6e613) · `.github/workflows/publish.yml` · [DEPLOYMENT_AND_ROLLBACK.md](../DEPLOYMENT_AND_ROLLBACK.md) | Validação estática verde; execução remota pendente de push de tag `v*` |
| Interface e documentação de API | Páginas Pug de recomendação e RAG com citações clicáveis e abstinência; Swagger OpenAPI 3.0.3 dos 4 endpoints `/api/ai/*` | [commit 6d33d00](https://github.com/beatriz0freitas/EW2026-Projeto/commit/6d33d009c33d9ad163e074c41e397ee17019f375) · [commit 341c2a8](https://github.com/beatriz0freitas/EW2026-Projeto/commit/341c2a86739a053891d210a6e111b20bf4d1b9b6) · `services/api/swagger.yaml` | Render smoke e testes de controller; YAML parseado com resolução de refs verificado |
| Reprodutibilidade científica | Corpus sintético de 25 recursos (21 públicos, 4 privados deliberados), 15 queries anotadas (0–3), julgamentos para métricas exatas | [commit 5cfee82](https://github.com/beatriz0freitas/EW2026-Projeto/commit/5cfee82b208497334c772521da2ceddf241d8e9f) · [DATASET.md](../DATASET.md) | Fixtures JSON/JSONL auditáveis, sem dados pessoais |

## Resumo em números (verificados a 18/11/2026)

- 70 testes da API Node aprovados (inclui 14 adversariais de segurança).
- 196 testes do serviço de IA aprovados, sem Ollama nem downloads.
- 23 execuções do CI no GitHub Actions; a última (run #23) totalmente verde, incluindo build Docker com cache; falhas intermédias ficam registadas no histórico.
- 25 recursos indexáveis e 15 queries anotadas no corpus de avaliação.
- 8 serviços orquestrados em Docker Compose; 2 pipelines (CI e CD).
- Índice FAISS real: 21 recursos públicos, 768 dimensões, publicação atómica.

## Formulação ética

Todas as contribuições listadas foram desenvolvidas pela candidata Ana Beatriz
Freitas no âmbito da preparação desta candidatura, sobre a plataforma existente
do repositório (`main`/PR #17 como base auditada em [BASELINE.md](../BASELINE.md)).
As medições do benchmark foram obtidas em hardware local descrito no próprio
documento e são explicitamente sensíveis ao ambiente. As limitações (reranking
lento em CPU, CD ainda sem execução remota, interface não gravada ao vivo) são
declaradas em [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) e no
[EVALUATION.md](../EVALUATION.md), em vez de omitidas.
