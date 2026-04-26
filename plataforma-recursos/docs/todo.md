# Plataforma de Gestao e Disponibilizacao de Recursos Educativos (EW2026)

## TODO auditado e atualizado

Legenda:

- ✅ Implementado
- ⚠️ Parcial / com ressalvas
- ❌ Em falta

Atualizado em: 2026-04-26

Politica de configuracao (estado atual):

- nao sensiveis hardcoded no `docker-compose.yml`
- segredos via interpolacao de ambiente (`JWT_SECRET`, `SESSION_SECRET`, `INTERNAL_SERVICE_TOKEN`)
- `.env` e `.env.example` com foco em segredos

---

## 1) Cobertura do enunciado (Proposta 1)

### Objetivos funcionais

- ✅ Disponibilizar recursos educativos de varios tipos.
- ✅ Permitir adicionar novos recursos (ingest SIP via API e UI).
- ✅ Classificacao por tipo, ano, tema e hashtag (filtros e taxonomia).
- ✅ Permitir posts sobre recursos, com associação por `resourceId`.
- ✅ Permitir comentarios em posts.
- ✅ Sistema de ranking por estrelas (1..5), com media e total.

### SIP / DIP (OAIS)

- ✅ SIP em ZIP com validacao BagIt simplificada (bagit.txt, manifest-sha256.txt, data/, metadata.json).
- ✅ Validacao de checksums SHA-256 e deteccao de zip-slip.
- ✅ DIP disponivel por GET /api/oais/access/:id (na pratica, DIP = SIP, conforme enunciado inicial).
- ✅ Controlo publico/privado no access (publico aberto; privado apenas admin ou produtor dono).

### Utilizadores e perfis

- ✅ Autenticacao por username/email + password com JWT.
- ✅ Perfis admin, produtor e consumidor implementados no backend.
- ✅ Refresh token implementado (cookies no auth e renovacao server-side para a interface).
- ✅ Registo publico força `role=consumidor` e ignora `role`/`nivel_acesso` enviados pelo cliente.
- ⚠️ Autenticacoes alternativas (chave API, Google, Facebook) nao implementadas.

### Dados de utilizador

- ✅ nome, email, filiacao, role, data_registo, ultimo_acesso, ativo, password (hash bcrypt).

### Metainformacao de recursos

- ✅ tipo, titulo, visibilidade, produtor e data de registo no sistema existem no fluxo/modelo.
- ⚠️ subtitulo e dataCriacao nao sao obrigatorios no ingest (ha recursos sem estes campos).
- ⚠️ validacao de metadata ainda minima (obrigatorio apenas tipo, titulo, visibilidade).

### Noticias na pagina principal

- ✅ Noticias manuais (admin) e listagem das ultimas 5 na home.
- ✅ Noticias automaticas do sistema implementadas (nova submissao, top3 e total de utilizadores).

### Dataset para demonstracao

- ⚠️ Existem entradas reais no storage (atualmente 6 AIPs), mas nao chega a "dezenas".

---

## 2) Estado por servico

## API (services/api)

- ✅ Estrutura modular com models, routes, middleware e lib.
- ✅ Swagger incorporado e disponível via Gateway em `http://localhost:16020/api/docs`.
- ✅ OAIS ingest e access operacionais.
- ✅ CRUD principal: resources, posts, comments, ratings e news.
- ✅ Export/import de dados globais (GET /api/export e POST /api/import, admin).
- ✅ Paginacao e respostas de erro utilitarias centralizadas em lib/http.js.
- ✅ Endpoint ratings/mine implementado e montado.
- ✅ NewsItem evoluido para sistema: tipo, eventType, dedupeKey, payload.
- ✅ Indice unico em dedupeKey para evitar duplicados em noticias de sistema.
- ✅ Servico comum de publicacao de noticias com dedupe (lib/newsPublisher.js).
- ✅ Endpoint interno POST /api/news/system com token interno de servico.
- ✅ Evento automatico system.new_submission no fim do ingest com dedupe por resourceId.
- ✅ Noticias automaticas `system.top3` e `system.total_users` publicadas por mudanca de estado (nao por agendamento diario).
- ✅ Contagem de downloads por recurso (downloadCount) no OAIS access para alimentar top3.
- ✅ Config valida e exige `INTERNAL_SERVICE_TOKEN` no arranque.
- ⚠️ PATCH de resources substitui metadata inteira; falta whitelist de campos permitidos.
- ✅ GET /api/posts aceita filtro opcional `resourceId`.
- ⚠️ Nao ha limite explicito em express.json() no API.
- ⚠️ Falta hardening adicional (helmet/cors explicito no gateway/rate limit central).

## Auth (services/auth)

- ✅ JWT, refresh token, verify e gestao de utilizadores admin.
- ✅ Swagger incorporado e disponível via Gateway em `http://localhost:16020/auth/docs`.
- ✅ Soft-delete de utilizador (ativo=false) em DELETE /users/:id.
- ✅ Hash de password com bcrypt e ocultacao de password em toJSON().
- ✅ Validacao de body dedicada para login/campos obrigatorios.
- ✅ app.js so faz listen apos conectar ao MongoDB.
- ✅ CORS ja configurado no auth.
- ✅ Publicacao automatica de noticia `system.total_users` quando o total de utilizadores muda (auth -> api, best-effort).
- ✅ Config valida e exige `JWT_SECRET` e `INTERNAL_SERVICE_TOKEN` no arranque.
- ⚠️ Refresh token e devolvido tambem em JSON no login (exposicao desnecessaria).
- ⚠️ JWT_REFRESH_SECRET tem fallback por defeito; ideal exigir segredo forte por ambiente.
- ❌ Rate limiting no login nao implementado.
- ❌ Helmet nao implementado.

## Gateway (services/gateway)

- ✅ Reverse proxy funcional: /api -> API, /auth -> Auth, / -> Interface.
- ✅ Regras especificas para /auth/login, /auth/register e /auth/logout irem para Interface.
- ✅ Handler central de 502 bad gateway em lib/proxy.js.
- ✅ proxyTimeout configurado (60s).
- ✅ Config centralizada em `services/gateway/lib/config.js` com validacao de PORT/URLs.
- ✅ Exposição de documentação Swagger dos serviços:
	- `http://localhost:16020/api/docs` -> API Swagger UI
	- `http://localhost:16020/auth/docs` -> Auth Swagger UI
	- `http://localhost:16020/interface/docs` -> Interface Swagger UI
- ❌ CORS explicito no gateway nao implementado.
- ❌ Helmet no gateway nao implementado.
- ❌ Rate limiting global nao implementado.
- ⚠️ Sem circuit breaker (apenas timeout e erro 502).

## Interface (services/interface)

- ✅ App Express com Pug, sessao, flash messages e rotas montadas.
- ✅ Login/registo/logout funcionais.
- ✅ Home com noticias recentes.
- ✅ Recursos: listagem, filtros (tipo/ano/tema/hashtag), detalhe, upload SIP, download DIP, ratings.
- ✅ Posts: listar, criar, detalhe, editar, apagar, comentar e remover comentario.
- ✅ Admin: utilizadores, noticias, export e import de dump.
- ✅ Interceptor 401 com renovacao automatica via refresh-server.
- ✅ Home mostra lista resumida de recursos recentes.
- ✅ Pagina de detalhe de recurso apresenta posts associados por `resourceId`.

---

## 3) Correcao explicita do checklist anterior

Itens que estavam marcados de forma incorreta e foram corrigidos:

- ✅ ratings/mine nao esta em ficheiro solto; esta implementado e montado em routes/ratings.js.
- ✅ Edicao de post na UI esta implementada (/posts/:id/edit).
- ✅ Remocao de comentario na UI esta implementada.
- ✅ Rotas duplicadas antigas routes/oais/* ja nao existem no estado atual.
- ✅ auth app.js nao arranca antes da BD; aguarda connect ao Mongo.
- ⚠️ CORS no auth ja existe, mas no gateway continua em falta.
- ✅ Registo publico ja nao permite elevacao de privilegios via `role`/`nivel_acesso`.

---

## 4) Backlog prioritario para fecho

1. Hardening transversal:

- Adicionar rate limit em POST /auth/sessions.
- Adicionar helmet em auth/api/gateway.
- Definir politica CORS explicita no gateway.
- Rever rotas internas para nao ficarem expostas no gateway (defesa em profundidade).

2. Metadados e contratos:

- Reforcar validacao do metadata.json (subtitulo opcional, dataCriacao/dataRegisto, enums visibilidade).
- Limitar PATCH /api/resources/:id a campos permitidos.

3. Experiencia funcional final:

- ✅ Mostrar recursos na home.
- ✅ Mostrar posts associados no detalhe de recurso (`resourceId`).
- ✅ Filtro GET `/api/posts?resourceId=...`.

4. Qualidade de entrega:

- Criar testes minimos (unitarios ingest + integracao auth/permissoes/OAIS).
- Aumentar dataset para dezenas de entradas reais para demonstracao final.

---

## 5) Estado final resumido

- Nucleo da Proposta 1: ✅ funcional.
- OAIS ingest/access: ✅ funcional.
- Auth com 3 perfis e controlo de acesso: ✅ funcional.
- Noticias automaticas (nova submissao, top3, total utilizadores): ✅ funcional.
- Interface end-to-end (auth, recursos, posts, admin): ✅ funcional.
- Associacao de posts a recursos com navegacao por home/detalhe: ✅ funcional.
- Seguranca de producao e testes automaticos: ❌ ainda em falta.
- Dataset de demonstracao com dezenas de recursos: ⚠️ ainda insuficiente.
