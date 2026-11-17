# TASK-16 — Deployment e Rollback (CD / GHCR)

## Pipeline de Continuous Delivery

O workflow `.github/workflows/publish.yml` compila e publica as imagens
Docker dos serviços `api` e `ai` no GitHub Container Registry.

- **Acionamento:** `push` de tags `v*` ou `workflow_dispatch` manual.
- **Autenticação:** `GITHUB_TOKEN` com `permissions: packages: write`
  (scoped ao job) e login em `ghcr.io` via `docker/login-action`.
- **Imagens publicadas:**
  - `ghcr.io/beatriz0freitas/ew2026-projeto-api`
  - `ghcr.io/beatriz0freitas/ew2026-projeto-ai`
- **Tags por execução:**
  - `sha-<commit_sha>` — imutável, corresponde exatamente ao código testado;
  - `latest` — mais recente publicada;
  - em tags `vX.Y.Z`: adicionalmente `X.Y.Z` e `X.Y` (via `docker/metadata-action`).
- **Multi-arquitetura:** `linux/amd64` e `linux/arm64` com `docker/build-push-action`
  e Buildx; cache GHA separado por serviço (`scope=ai` para o microserviço).
- **Auditoria:** os passos usam as mesmas versões de actions pinadas por SHA
  do CI, e o job `static-analysis-workflows` valida este workflow com
  `actionlint` e `zizmor` em cada push.

## Pinning de versões em produção

O `docker-compose.yml` local usa `build:` (fonte). Num ambiente de produção
ou VM provisionada, refere-se a imagem + tag imutável. Por exemplo:

```yaml
  api:
    image: ghcr.io/beatriz0freitas/ew2026-projeto-api:sha-<commit_sha>
  ai:
    image: ghcr.io/beatriz0freitas/ew2026-projeto-ai:sha-<commit_sha>
```

Dispôr de token de leitura do GHCR (pacote público dispensa autenticação;
pacote privado exige `docker login ghcr.io`).

## Procedimento de rollback

Em caso de anomalia após publicar uma nova versão:

1. **Identificar a última tag estável.** Consultar as versões do pacote em
   `https://github.com/beatriz0freitas?tab=packages` ou executar:

   ```bash
   docker manifest inspect ghcr.io/beatriz0freitas/ew2026-projeto-api:latest
   ```

2. **Reverter a tag no `docker-compose.yml`** do serviço afetado
   (apenas `api` ou `ai`, conforme a anomalia), trocando para o SHA da
   versão estável anterior — nunca usar `latest` em rollback, para garantir
   reprodutibilidade:

   ```yaml
   image: ghcr.io/beatriz0freitas/ew2026-projeto-ai:sha-<sha_anterior_estavel>
   ```

3. **Aplicar a mudança:**

   ```bash
   docker compose up -d api ai
   ```

   O Compose recria apenas os serviços cuja imagem mudou; `mongodb` e
   `ollama` mantêm os volumes de dados de modelos.

4. **Verificar a health:**

   ```bash
   curl -fsS http://localhost:16025/health
   docker compose exec ai python -c \
     "import requests; requests.get('http://127.0.0.1:8000/live', timeout=2).raise_for_status()"
   ```

5. **Registar o incidente** (sintoma, tag problemática, tag de rollback,
   tempo de recuperação) para alimentar a secção de ameaças à validade
   da `EVALUATION.md` e as lições do dossiê.

Como cada tag `sha-<sha>` é imutável, o rollback é determinístico: o mesmo
binário volta a correr, sem recompilação. Corrigir a causa-raiz em novo
commit e publicar nova tag `v*`; nunca reescrever tags já publicadas.
