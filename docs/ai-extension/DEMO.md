# Roteiro de Demonstração (5 minutos) — TASK-19

**Objetivo:** demonstrar ao vivo, num único ambiente local, o ecossistema
completo: LLMs locais, RAG, recomendação com justificativa, ACL de segurança,
análise estática e CI.

Pré-requisitos (preparar antes de gravar, não durante a demo):
`docker compose up -d` na pasta `plataforma-recursos/` com `.env` configurado,
modelos descarregados (`bash scripts/pull_models.sh`) e utilizadores
`consumidor.teste` / `produtor.teste` e um recurso privado de outro utilizador
no sistema.

## Minuto 0–1 — Arquitetura e pipeline CI (sem código)

1. Abrir https://github.com/beatriz0freitas/EW2026-Projeto na branch `beatriz`.
2. Mostrar `.github/workflows/ci.yml`: actionlint, zizmor, Ruff/Bandit, testes
   das duas stacks e build Docker.
3. Abrir a execução https://github.com/beatriz0freitas/EW2026-Projeto/actions/runs/44295987766
   e percorrer os 5 jobs verde.

## Minuto 1–2 — Swagger dos endpoints de IA

1. Abrir `http://localhost:16020/api/docs`, selecionar a spec **API**.
2. Mostrar `POST /api/ai/recommend`, `ask`, `search` e `cluster` documentados.
3. Executar um pedido de teste de busca com `X-Internal-Token` deliberadamente
   errado para demonstrar o 401/403.

## Minuto 2–3 — Isolamento de ACL (segurança primeiro)

1. `http://localhost:16020` — login com `consumidor.teste`.
2. Confirmar que o recurso privado de outro utilizador não está visível.
3. No Swagger (ou via curl), submeter `POST /api/ai/ask` exigindo explicitamente
   o ID de um recurso privado de outro utilizador.
4. Mostrar que a resposta não contém esse recurso — o serviço `ai` só recebe
   `allowed_ids` pré-filtrados, e o backend revalida tudo à receção.

## Minuto 3–4 — RAG com citações e abstinência

1. Na interface, abrir "Perguntar aos Recursos".
2. Pergunta no domínio: por exemplo "Como funciona o algoritmo de Raft?"
   → resposta com citações clicáveis para `/resources/:id`.
3. Pergunta fora do domínio: por exemplo "Qual o resultado do último Campeonato do Mundo?"
   → resposta com aviso claro de abstinência (`insufficientEvidence: true`) e sem citações inventadas.

## Minuto 4–5 — Recomendação com justificação

1. Abrir "Recomendações IA".
2. Inserir objetivo real: "Quero aprender tolerância a falhas e consenso em
   sistemas distribuídos", escolher topK.
3. Percorrer os resultados: rank, score, título clicável e a justificação
   pedagógica gerada pelo modelo local.
4. Fechar mostrando o fallback: se o modelo falhar/timeout, a ordenação
   `semantic_fallback` garante que a página nunca fica vazia.

## Perguntas prováveis e respostas rápidas

**Onde estão os dados?** `plataforma-recursos/data/ai-fixtures/`
(25 recursos, 21 públicos, 4 privados; 15 queries com julgamentos 0–3),
especificação em `docs/ai-extension/DATASET.md`.

**Em que hardware correu?** Linux x86_64, 8 vCPU, 7,4 GB RAM, Ollama 0.6.0 em
CPU com `llama3.2:1b` e `nomic-embed-text` (detalhes: `BASELINE.md`,
`EVALUATION.md`).

**Testes?** 70 testes da API (14 adversariais) + 174 testes do serviço de IA;
todos verdes no CI online e no ambiente local demonstrado.

**E se algo falhar em produção?** `DEPLOYMENT_AND_ROLLBACK.md` — tags imutáveis
`sha-<SHA>`, rollback determinístico sem recompilação.

Não conjecturar se algo não foi verificado: se surgir dúvida sobre a
qualidade do reranking, remeter para os números reais de `EXPERIMENTS.csv`
e para a discussão das limitações em `EVALUATION.md`.
