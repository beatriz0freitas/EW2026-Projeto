# Apoio de Implementação e Decisão (guia prático)

> **Objetivo:** consulta direta para dúvidas de implementação, arquitetura e decisões.
>
> **Atualizado em:** 2026-04-25

## Decisões vigentes (resumo)

- Arquitetura: `nginx` (borda externa), `gateway` (routing de aplicação), `auth` (identidade), `api` (domínio), `interface` (UI).
- Segurança: autorização sempre no backend; UI apenas apoia UX.
- Padrão de código: rotas pequenas + helpers partilhados + validação precoce + erros consistentes.
- Configuração: `docker-compose.yml` com variáveis não sensíveis hardcoded por serviço; segredos por interpolação (`${JWT_SECRET}`, `${SESSION_SECRET}`, `${INTERNAL_SERVICE_TOKEN}`).
- Ficheiros de segredos: `.env` e `.env.example` mantêm apenas segredos necessários no estado atual.
- Leitura de configuração centralizada por serviço em `lib/config.js` (API/Auth/Interface/Gateway).
- Resiliência: `api` e `auth` arrancam apenas após ligação ao MongoDB; falha de ligação termina o processo.
- Estado de autenticação: access token + refresh token, com renovação automática na interface em pedidos à API.
- Integração interna entre serviços protegida por token interno (`INTERNAL_SERVICE_TOKEN`) para operações de sistema.
- Documentação técnica incorporada por Swagger em `api` e `auth`, com visualização direta e também via gateway.

## Pendentes prioritários (implementação)

- Hardening adicional: `helmet`, rate limit login e auditoria de CORS por ambiente.
- Testes mínimos unitários e integração (API/Auth/Interface).
- Cobertura adicional de validação/sanitização de inputs em rotas menos críticas.

**Notas recentes (2026-04-25):**

- Fluxo OAIS fechado na UI: upload SIP (produtor/admin) e download DIP (público e privado com autorização).
- Gateway encaminha páginas HTML de auth (`/auth/login`, `/auth/register`, `/auth/logout`) para a Interface; endpoints JSON continuam no serviço Auth.
- `nginx` fica exposto ao exterior e reencaminha todo o tráfego para o `gateway`, mantendo o gateway apenas na rede Docker.
- API aceita token por header, cookie e query string (compatibilidade).
- Sessão web da interface implementada e configurável por `SESSION_COOKIE_NAME`.
- API e Auth já publicam/consomem notícias de sistema (submissões, utilizadores e jobs diários) usando token interno.
- Swagger disponível nos serviços e acessível pelo gateway para testes funcionais rápidos.

## Swagger (estado atual)

- Hub agregado (seleção API/Auth/Interface): `http://localhost:16020/docs`

### API

- Especificação: `services/api/swagger.yaml`
- UI via gateway: `http://localhost:16020/api/docs`

### Auth

- Especificação: `services/auth/swagger.yaml`
- UI via gateway: `http://localhost:16020/auth/docs`

### Interface

- Especificação: `services/interface/swagger.yaml`
- UI via gateway: `http://localhost:16020/interface/docs`

### Utilização prática

- Para demo local com gateway, usar:
  - `http://localhost:16020/docs`
  - `http://localhost:16020/api/docs`
  - `http://localhost:16020/auth/docs`
  - `http://localhost:16020/interface/docs`

Observação: os endpoints em Swagger que exigem autenticação devem receber token válido (`Bearer`) para testes em rotas protegidas.

## Base detalhada (contexto, fundamentação e especificações)

## 2) Princípios orientadores adotados

### P1. Alinhamento explícito com OAIS

- O enunciado define o fluxo `Producer -> SIP -> Ingest -> AIP -> Access -> DIP -> Consumer`.
- Decisão: mapear módulos OAIS no serviço API e manter o fluxo observável no código.
- Evidência: [services/api/oais/ingest/index.js](../services/api/oais/ingest/index.js), [services/api/oais/ingest/sip.js](../services/api/oais/ingest/sip.js), [services/api/oais/access/index.js](../services/api/oais/access/index.js), [services/api/oais/access/dip.js](../services/api/oais/access/dip.js)

### P2. Separação de responsabilidades por serviço

- Decisão: separar `gateway`, `auth`, `api` e `interface`.
- Fundamentação: reduz acoplamento, facilita manutenção e teste isolado.
- Evidência: [services/gateway/app.js](../services/gateway/app.js), [services/auth/app.js](../services/auth/app.js), [services/api/app.js](../services/api/app.js), [services/interface/app.js](../services/interface/app.js)

### P3. Segurança por defeito

- Decisão: aplicar autenticação/autorização no backend para operações críticas.
- Fundamentação: regras de acesso do enunciado (admin/produtor/consumidor) + princípio do menor privilégio.
- Evidência: [services/auth/auth/auth.js](../services/auth/auth/auth.js), [services/api/middleware/auth.js](../services/api/middleware/auth.js)

### P4. Soluções simples primeiro (MVP sólido)

- Decisão: implementar primeiro o essencial funcional (auth, ingest, access, CRUD principal), deixando otimizações para fases seguintes.
- Fundamentação: cumprir requisitos nucleares com menor risco.
- Evidência: [services/api/routes/index.js](../services/api/routes/index.js), [services/auth/routes/index.js](../services/auth/routes/index.js)

### P5. Evolução incremental e rastreável

- Decisão: manter estado no `todo.md` e documentação de decisões.
- Fundamentação: facilita auditoria técnica, apresentação e defesa do projeto.
- Evidência: [docs/todo.md](todo.md), [docs/apoio.md](apoio.md)

---

## 3) Decisões já efetuadas (com fundamentação)

## 3.1 Arquitetura e infraestrutura

### D-01 — Arquitetura por microserviços (`gateway`, `auth`, `api`, `interface`)

**Estado:** Aprovada e implementada.

**Decisão:** isolar funções por serviço.

**Fundamentação:**

- O enunciado exige autenticação, operações de domínio e interface web; separar responsabilidades torna o sistema mais claro.
- O README já formaliza este fluxo: cliente passa pelo gateway para interface/api/auth.

**Impacto positivo:**

- Deploy e debug por serviço;
- Limites claros de domínio;
- Menor risco de regressões cruzadas.

**Evidência no código:** [docker-compose.yml](../docker-compose.yml), [services/](../services)

---

### D-02 — `nginx` como borda externa e `gateway` como entrada lógica

**Estado:** Aprovada e implementada.

**Decisão:** expor externamente só o `nginx`; manter o `gateway` como ponto de entrada lógico para Interface/API/Auth.

**Fundamentação:**

- Preserva a lógica de routing já implementada no `gateway`, incluindo o conflito `/auth/*`;
- Coloca uma borda HTTP própria para HTTPS, compressão, limites de upload e futuras políticas transversais.

**Impacto positivo:**

- Menor superfície de ataque externa;
- Configuração de cliente simplificada;
- Menor custo de mudança do que mover todo o routing para `nginx`.

**Evidência no código:** [docker-compose.yml](../docker-compose.yml), [infra/nginx/default.conf](../infra/nginx/default.conf), [services/gateway/app.js](../services/gateway/app.js)

---

### D-03 — Persistência híbrida para OAIS (MongoDB + storage em disco)

**Estado:** Aprovada e implementada.

**Decisão:**

- metadados e entidades de negócio em MongoDB;
- binários AIP em `data/aip/`.

**Fundamentação:**

- OAIS separa claramente dados descritivos de conteúdo arquivístico;
- simplifica pesquisas (DB) e gestão de ficheiros (storage).

**Impacto positivo:**

- consultas rápidas por metadados;
- extração e entrega de DIP sem sobrecarga da DB.

**Evidência no código:** [services/api/models/Resource.js](../services/api/models/Resource.js), [data/aip/](../data/aip/), [services/api/oais/access/dip.js](../services/api/oais/access/dip.js)

---

## 3.2 Autenticação e autorização

### D-04 — Modelo de utilizador com perfis `admin`, `produtor`, `consumidor`

**Estado:** Aprovada e implementada.

**Decisão:** seguir os três níveis mínimos do enunciado.

**Fundamentação:**

- Requisito explícito da Proposta 1.
- Permite traduzir regras de negócio para permissões técnicas.

**Impacto positivo:**

- política de acesso explícita;
- controlo fino de operações de gestão.

**Evidência no código:** [services/auth/models/User.js](../services/auth/models/User.js)

---

### D-05 — Password com hash e não exposição em respostas

**Estado:** Aprovada e implementada.

**Decisão:** hash automático (`bcrypt`) e remoção da password em serialização.

**Fundamentação:**

- Boa prática fundamental: nunca guardar nem devolver password em texto plano.

**Impacto positivo:**

- proteção de credenciais;
- redução do impacto de fuga de dados.

**Evidência no código:** [services/auth/models/User.js](../services/auth/models/User.js)

---

### D-06 — JWT para sessão de API

**Estado:** Aprovada e implementada.

**Decisão:**

- login gera JWT;
- endpoint de verificação usado por outros serviços;
- endpoints de sessão (`/auth/sessions/*`) para verificação e renovação de token.

**Fundamentação:**

- Compatível com arquitetura distribuída;
- simplifica autenticação entre serviços.

**Impacto positivo:**

- integra facilmente com gateway/interface/api;
- baixa dependência de sessão stateful central.

**Evidência no código:** [services/auth/routes/sessions.js](../services/auth/routes/sessions.js), [services/auth/routes/index.js](../services/auth/routes/index.js), [services/api/middleware/auth.js](../services/api/middleware/auth.js)

---

### D-07 — `JWT_SECRET` obrigatório (sem fallback inseguro)

**Estado:** Aprovada e implementada.

**Decisão:** impedir arranque do `auth` sem `JWT_SECRET` configurado.

**Fundamentação:**

- Segurança por defeito: fallback hardcoded fragiliza todo o sistema.

**Impacto positivo:**

- evita configuração insegura em produção/demonstração.

**Evidência no código:** [services/auth/routes/sessions.js](../services/auth/routes/sessions.js), [services/auth/routes/index.js](../services/auth/routes/index.js), [services/auth/auth/auth.js](../services/auth/auth/auth.js)

---

### D-08 — Rotas admin protegidas com middleware dedicado

**Estado:** Aprovada e implementada.

**Decisão:** usar `requireAuth` + `requireAdmin` para operações administrativas.

**Fundamentação:**

- requisito de perfis do enunciado;
- menor privilégio por endpoint.

**Impacto positivo:**

- garante enforcement de regras de acesso no backend (não só na UI).

**Evidência no código:** [services/auth/routes/users.js](../services/auth/routes/users.js), [services/auth/auth/auth.js](../services/auth/auth/auth.js)

---

## 3.3 OAIS (Ingest, Access, DIP)

### D-09 — Ingest SIP com validações estruturais e de integridade

**Estado:** Aprovada e implementada.

**Decisão:** validar ZIP, estrutura BagIt simplificada, metadata e checksums.

**Fundamentação:**

- Enunciado exige verificação contra manifesto e validações adicionais;
- base BagIt indicada no PDF.

**Impacto positivo:**

- evita entrada de pacotes corrompidos ou malformados;
- melhora confiança do repositório.

**Evidência no código:** [services/api/oais/ingest/sip.js](../services/api/oais/ingest/sip.js), [services/api/oais/ingest/index.js](../services/api/oais/ingest/index.js)

---

### D-10 — DIP inicial igual ao SIP (DIP = SIP)

**Estado:** Aprovada e implementada.

**Decisão:** no access, devolver pacote equivalente ao armazenado, sem transformação complexa inicial.

**Fundamentação:**

- Enunciado permite explicitamente “numa fase inicial, DIP = SIP”.

**Impacto positivo:**

- reduz complexidade;
- entrega valor cedo com conformidade ao enunciado.

**Evidência no código:** [services/api/oais/access/dip.js](../services/api/oais/access/dip.js), [services/api/oais/access/index.js](../services/api/oais/access/index.js)

---

### D-11 — Controlo de visibilidade no acesso a recursos

**Estado:** Aprovada e implementada.

**Decisão:**

- recurso público: download aberto;
- recurso privado: apenas admin ou produtor dono.

**Fundamentação:**

- requisito de visibilidade da Proposta 1;
- coerência com perfis de utilizador.

**Impacto positivo:**

- proteção efetiva de recursos privados;
- comportamento previsível para utilizadores.

**Evidência no código:** [services/api/oais/access/index.js](../services/api/oais/access/index.js), [services/api/models/Resource.js](../services/api/models/Resource.js)

---

## 3.4 Modelo de domínio e API de negócio

### D-12 — Entidades de domínio mínimas da Proposta 1

**Estado:** Aprovada e implementada.

**Decisão:** modelos para `Resource`, `Post`, `Comment`, `Rating` e `NewsItem`.

**Fundamentação:**

- cobre integralmente os objetivos funcionais descritos no enunciado.

**Impacto positivo:**

- base estável para interface e testes;
- sem overengineering.

**Evidência no código:** [services/api/models/Resource.js](../services/api/models/Resource.js), [services/api/models/Post.js](../services/api/models/Post.js), [services/api/models/Comment.js](../services/api/models/Comment.js), [services/api/models/Rating.js](../services/api/models/Rating.js), [services/api/models/NewsItem.js](../services/api/models/NewsItem.js)

---

### D-13 — Ratings com 1 voto por utilizador/recurso

**Estado:** Aprovada e implementada.

**Decisão:** índice único `(resourceId, userId)` e atualização do voto existente.

**Fundamentação:**

- boa prática para evitar inflação artificial de rankings;
- mantém ranking justo e simples de explicar.

**Impacto positivo:**

- dados consistentes;
- cálculo de média fiável.

**Evidência no código:** [services/api/models/Rating.js](../services/api/models/Rating.js), [services/api/routes/ratings.js](../services/api/routes/ratings.js)

---

### D-14 — CRUD principal com regras de posse e perfil

**Estado:** Aprovada e implementada.

**Decisão:**

- edição/remoção de recursos e posts restrita a admin ou dono;
- comentários removíveis por dono ou admin.

**Fundamentação:**

- princípio de autorização contextual (perfil + propriedade do recurso).

**Impacto positivo:**

- reduz ações indevidas;
- corresponde ao comportamento esperado em plataformas colaborativas.

**Evidência no código:** [services/api/routes/resources.js](../services/api/routes/resources.js), [services/api/routes/posts.js](../services/api/routes/posts.js), [services/api/routes/comments.js](../services/api/routes/comments.js)

---

### D-15 — Paginação nas listagens principais

**Estado:** Aprovada e implementada.

**Decisão:** `page` + `limit` em listagens de recursos/posts/comentários/notícias.

**Fundamentação:**

- boa prática de performance e previsibilidade da API.

**Impacto positivo:**

- evita respostas excessivas;
- UX melhor na interface.

**Evidência no código:** [services/api/routes/resources.js](../services/api/routes/resources.js), [services/api/routes/posts.js](../services/api/routes/posts.js), [services/api/routes/comments.js](../services/api/routes/comments.js), [services/api/routes/news.js](../services/api/routes/news.js)

---

## 3.5 Qualidade técnica e governança do código

### D-16 — Atualização contínua do backlog (`todo.md`)

**Estado:** Aprovada e implementada.

**Decisão:** manter rastreio de concluído/parcial/pendente.

**Fundamentação:**

- prática de gestão incremental e transparência de estado.

**Impacto positivo:**

- facilita coordenação e priorização.

**Evidência no código:** [todo.md](../../todo.md)

---

## 4) Decisões pendentes (ainda por fechar)

## 4.1 Interface

### PEND-01 — Sessão web na interface

**Estado:** Por implementar.

**Decidir entre:**

- sessão com cookie HTTP-only;
- ou armazenamento de JWT em cookie de sessão da interface.

**Recomendação:** cookie HTTP-only + proteção CSRF nas rotas de escrita da interface.

**Ficheiros-alvo:** [services/interface/app.js](../services/interface/app.js), [services/interface/routes/auth.js](../services/interface/routes/auth.js)

---

### PEND-02 — Layout e experiência de utilização

**Estado:** Por implementar.

**Recomendação:**

- layout base único;
- mensagens de feedback (erro/sucesso);
- guardas visuais por perfil sem depender apenas do frontend.

**Ficheiros-alvo:** [services/interface/views/layout.pug](../services/interface/views/layout.pug), [services/interface/routes/index.js](../services/interface/routes/index.js)

---

## 4.2 Segurança

### PEND-03 — Rate limiting em login

**Estado:** Por implementar.

**Justificação:** mitigar brute force.

**Ficheiro-alvo:** [services/auth/routes/sessions.js](../services/auth/routes/sessions.js)

### PEND-04 — Validação e sanitização transversal

**Estado:** Por implementar.

**Justificação:** evitar payloads inválidos e reduzir risco de injeções/XSS persistente.

**Ficheiros-alvo:** [services/api/routes/](../services/api/routes), [services/auth/routes/](../services/auth/routes)

### PEND-05 — Headers de segurança e CORS no gateway

**Estado:** Por implementar.

**Justificação:** baseline de hardening para ambiente web.

**Ficheiro-alvo:** [services/gateway/app.js](../services/gateway/app.js)

---

## 4.3 Testes

### PEND-06 — Testes unitários do ingest

**Estado:** Por implementar.

### PEND-07 — Testes de integração de permissões

**Estado:** Por implementar.

**Justificação comum:** garantir que regras de acesso e OAIS não regressam com alterações futuras.

**Ficheiros-alvo:** [services/api/oais/ingest/sip.js](../services/api/oais/ingest/sip.js), [services/api/oais/access/index.js](../services/api/oais/access/index.js), [services/auth/routes/users.js](../services/auth/routes/users.js)

---

## 5) Rastreabilidade requisito -> decisão

| Requisito do enunciado                               | Decisão associada            | Estado |
| ---------------------------------------------------- | ----------------------------- | ------ |
| OAIS com SIP/AIP/DIP                                 | D-09, D-10, D-11              | ✅     |
| Importação e exportação do pacote                | D-09, D-10                    | ✅     |
| Perfis Admin/Produtor/Consumidor                     | D-04, D-08, D-14              | ✅     |
| Recursos classificados por taxonomia/hashtags        | D-12                          | ✅     |
| Posts e comentários                                 | D-12, D-14                    | ✅     |
| Ranking por estrelas                                 | D-13                          | ✅     |
| Notícias na página principal                       | D-12 (API) / PEND-02 (UI)     | ⚠️   |
| Plataforma completa utilizável por utilizador final | PEND-01, PEND-02, PEND-03..07 | ❌     |

---

## 7) Especificação detalhada das rotas implementadas

Esta secção descreve as rotas **efetivamente disponíveis** no estado atual do código.

## 7.1 Gateway (entrada única)

Base pública: `/*`

**Evidência:** [services/gateway/app.js](../services/gateway/app.js), [services/gateway/routes/index.js](../services/gateway/routes/index.js)

- `GET /health` → health do gateway (`{ status: 'ok' }`).
- `/*` encaminhado por proxy:
  - `/api/*` → serviço API;
  - `/auth/*` → serviço Auth;
  - restantes caminhos → serviço Interface.

## 7.2 Serviço Auth

Base no gateway: `/auth/*`

**Evidência:** [services/auth/routes/index.js](../services/auth/routes/index.js), [services/auth/routes/users.js](../services/auth/routes/users.js), [services/auth/routes/sessions.js](../services/auth/routes/sessions.js), [services/auth/auth/auth.js](../services/auth/auth/auth.js)

### 7.2.1 `POST /auth/register`

- **Descrição:** registo público de utilizador.
- **Auth:** não.
- **Body mínimo:** `nome`, `email`, `password` (mínimo 6).
- **Body opcional:** `filiacao`.
- **Regra:** nível inicial sempre `consumidor`.
- **Resposta:** `201 { ok: true, user }`.
- **Erros típicos:** `400`, `409`, `500`.

### 7.2.2 `POST /auth/sessions`

- **Descrição:** login e emissão de JWT.
- **Auth:** não.
- **Body mínimo:** `email`, `password`.
- **Resposta:** `200 { ok: true, token, user }`.
- **Erros típicos:** `400`, `401`, `500`.

### 7.2.3 `GET /auth/sessions/verify`

- **Descrição:** valida token e devolve payload.
- **Auth:** Bearer token obrigatório **ou** cookie httpOnly (`AUTH_COOKIE_NAME`).
- **Resposta:** `200 { ok: true, payload }`.
- **Erros típicos:** `401` (ausente, inválido ou expirado).

### 7.2.3.1 `POST /auth/sessions/logout`

- **Descrição:** limpa cookie de autenticação (modo browser).
- **Auth:** não.
- **Resposta:** `200 { ok: true }`.

### 7.2.8 CORS no serviço Auth

- **Descrição:** o serviço Auth permite origem configurável para uso com JWT em cookie.
- **Configuração:** `AUTH_CORS_ORIGIN` (ex.: `http://localhost:16020`).
- **Headers/métodos:** `Content-Type`, `Authorization`, `X-Request-Id`; métodos `GET, POST, PUT, PATCH, DELETE, OPTIONS`.

### 7.2.5 `GET /auth/users`

- **Descrição:** listagem de utilizadores.
- **Auth:** admin (`requireAuth` + `requireAdmin`).
- **Resposta:** `200 { ok: true, users }`.

### 7.2.6 `PATCH /auth/users/:id`

- **Descrição:** atualização parcial de utilizador.
- **Auth:** admin.
- **Campos permitidos:** `nome`, `nivel`, `filiacao`.
- **Validação:** `nivel` em `{admin, produtor, consumidor}`.
- **Respostas típicas:** `200`, `400`, `404`, `500`.

### 7.2.7 `DELETE /auth/users/:id`

- **Descrição:** remoção de utilizador.
- **Auth:** admin.
- **Regra extra:** não permite auto-remoção do admin autenticado.
- **Respostas típicas:** `200`, `400`, `404`, `500`.

## 7.3 Serviço API

Base no gateway: `/api/*`

**Evidência:** [services/api/routes/index.js](../services/api/routes/index.js), [services/api/middleware/auth.js](../services/api/middleware/auth.js)

### 7.3.1 Saúde

#### `GET /api/health`

- **Descrição:** healthcheck da API.
- **Auth:** não.
- **Resposta:** `{ status: 'ok' }`.

### 7.3.2 OAIS

**Evidência:** [services/api/oais/ingest/index.js](../services/api/oais/ingest/index.js), [services/api/oais/ingest/sip.js](../services/api/oais/ingest/sip.js), [services/api/oais/access/index.js](../services/api/oais/access/index.js), [services/api/oais/access/dip.js](../services/api/oais/access/dip.js)

#### `POST /api/oais/ingest`

- **Descrição:** ingestão SIP para AIP.
- **Auth:** `produtor` ou `admin`.
- **Content-Type:** `multipart/form-data`.
- **Campo obrigatório:** `sip` (ZIP).
- **Limite:** 100MB.
- **Resposta de sucesso:** `201 { ok: true, resourceId }`.
- **Erros típicos:** `400` (sem ficheiro), `422` (SIP inválido).

#### `GET /api/oais/access/:id`

- **Descrição:** devolve ZIP DIP (atualmente DIP=SIP).
- **Auth:** opcional, com controlo por visibilidade.
- **Regras:**
  - público: acesso aberto;
  - privado: apenas admin ou produtor dono.
- **Resposta:** download `application/zip`.
- **Erros típicos:** `400`, `401`, `403`, `404`.

### 7.3.3 Recursos

**Evidência:** [services/api/routes/resources.js](../services/api/routes/resources.js)

#### `GET /api/resources`

- **Auth:** opcional.
- **Query:** filtros `tipo`, `ano`, `tema`, `hashtag`; paginação `page`, `limit`.
- **Resposta:** `{ ok, page, limit, total, totalPages, items }`.

#### `GET /api/resources/:id`

- **Auth:** opcional.
- **Validação:** `id` Mongo válido.

#### `PATCH /api/resources/:id`

- **Auth:** `produtor`/`admin` + regra de posse.
- **Body suportado:** `metadata`.
- **Validação:** `id` Mongo válido.

#### `DELETE /api/resources/:id`

- **Auth:** `produtor`/`admin` + regra de posse.
- **Validação:** `id` Mongo válido.

### 7.3.4 Posts

**Evidência:** [services/api/routes/posts.js](../services/api/routes/posts.js)

#### `GET /api/posts`

- **Auth:** não.
- **Query:** `page`, `limit`.

#### `POST /api/posts`

- **Auth:** `produtor`/`admin`.
- **Body mínimo:** `titulo`, `conteudo`.
- **Body opcional:** `resourceId` (se enviado, é validado).

#### `GET /api/posts/:id`

- **Auth:** não.
- **Validação:** `id` Mongo válido.

#### `PATCH /api/posts/:id`

- **Auth:** `produtor`/`admin` + dono/admin.
- **Body suportado:** `titulo`, `conteudo`.
- **Validação:** `id` Mongo válido.

#### `DELETE /api/posts/:id`

- **Auth:** `produtor`/`admin` + dono/admin.
- **Validação:** `id` Mongo válido.

### 7.3.5 Comentários

**Evidência:** [services/api/routes/comments.js](../services/api/routes/comments.js)

#### `GET /api/posts/:id/comments`

- **Auth:** não.
- **Query:** `page`, `limit` (default 20).
- **Validação:** `id` Mongo válido.

#### `POST /api/posts/:id/comments`

- **Auth:** utilizador autenticado.
- **Body mínimo:** `texto`.
- **Validação:** `id` Mongo válido.

#### `DELETE /api/posts/:id/comments/:cid`

- **Auth:** autenticado + dono/admin.
- **Validação:** `id` e `cid` Mongo válidos.

### 7.3.6 Ratings

**Evidência:** [services/api/routes/ratings.js](../services/api/routes/ratings.js)

#### `POST /api/resources/:id/ratings`

- **Auth:** autenticado.
- **Body:** `stars` inteiro entre 1 e 5.
- **Regra:** um rating por `(resourceId, userId)`.

#### `GET /api/resources/:id/ratings`

- **Auth:** não.
- **Resposta:** `{ ok, media, total }`.

### 7.3.7 Notícias

**Evidência:** [services/api/routes/news.js](../services/api/routes/news.js)

#### `GET /api/news`

- **Auth:** não.
- **Query:** `page`, `limit`.

#### `POST /api/news`

- **Auth:** admin.
- **Body mínimo:** `titulo`, `conteudo`.

#### `DELETE /api/news/:id`

- **Auth:** admin.
- **Validação:** `id` Mongo válido.

### 7.3.8 Taxonomia

- Endpoint removido do serviço API para simplificação.

## 7.4 Serviço Interface (rotas web)

Base no gateway: `/` (renderização Pug)

**Evidência:** [services/interface/app.js](../services/interface/app.js), [services/interface/routes/index.js](../services/interface/routes/index.js), [services/interface/routes/auth.js](../services/interface/routes/auth.js), [services/interface/routes/resources.js](../services/interface/routes/resources.js), [services/interface/routes/posts.js](../services/interface/routes/posts.js), [services/interface/routes/admin.js](../services/interface/routes/admin.js)

### 7.4.1 Gerais

- `GET /health` → health da interface (`{ status: 'ok' }`).
- `GET /` → homepage com notícias recentes.

### 7.4.2 Autenticação UI

- `GET /auth/login` / `POST /auth/login`
- `GET /auth/register` / `POST /auth/register`
- `GET /auth/logout` e `POST /auth/logout`

### 7.4.3 Recursos UI

- `GET /resources` → listagem.
- `GET /resources/:id` → detalhe + rating agregado.
- `POST /resources/:id/ratings` → classificar (sessão obrigatória).

### 7.4.4 Posts UI

- `GET /posts` → listagem.
- `GET /posts/new` e `POST /posts` → criar (produtor/admin).
- `GET /posts/:id` → detalhe + comentários.
- `POST /posts/:id/comments` → comentar (sessão obrigatória).
- `POST /posts/:id/delete` → apagar post (produtor/admin, validado no backend).

### 7.4.5 Administração UI

Todas as rotas abaixo exigem sessão + perfil `admin`:

- `GET /admin/users`
- `POST /admin/users/:id/level`
- `POST /admin/users/:id/delete`
- `GET /admin/news`
- `POST /admin/news`
- `POST /admin/news/:id/delete`

---

## 8) Especificação detalhada de objetos e atributos

## 8.1 Objeto `User` (serviço auth)

**Evidência de implementação:** [services/auth/models/User.js](../services/auth/models/User.js)

- `nome` (String, obrigatório, trim)
- `email` (String, obrigatório, único, lowercase, trim)
- `password` (String, obrigatório, hash bcrypt em pre-save)
- `nivel` (Enum: `admin | produtor | consumidor`, default `consumidor`)
- `filiacao` (Objeto)
  - `tipo` (Enum: `estudante | docente | outro`, default `estudante`)
  - `curso` (String)
  - `departamento` (String)
- `dataRegisto` (Date)
- `dataUltimoAcesso` (Date)

**Métodos relevantes:**

- `checkPassword(plain)`
- `toJSON()` sem `password`

---

## 8.2 Objeto `Resource`

**Evidência de implementação:** [services/api/models/Resource.js](../services/api/models/Resource.js)

- `metadata` (Object, obrigatório)
- `aipPath` (String, obrigatório)
- `produtor` (String, id lógico do utilizador no auth)
- `createdAt` (Date)

**Nota:** filtros da API assumem campos em `metadata.resource.*` (`tipo`, `ano`, `tema`, `hashtags`, `visibilidade`).

---

## 8.3 Objeto `Post`

**Evidência de implementação:** [services/api/models/Post.js](../services/api/models/Post.js)

- `titulo` (String, obrigatório, max 160)
- `conteudo` (String, obrigatório, max 20000)
- `resourceId` (ObjectId `Resource`, opcional)
- `autorId` (String, obrigatório)
- `autorNome` (String)
- `createdAt` (Date)
- `updatedAt` (Date, atualizado em pre-save)

---

## 8.4 Objeto `Comment`

**Evidência de implementação:** [services/api/models/Comment.js](../services/api/models/Comment.js)

- `postId` (ObjectId `Post`, obrigatório, indexado)
- `autorId` (String, obrigatório)
- `autorNome` (String)
- `texto` (String, obrigatório, max 5000)
- `createdAt` (Date)

---

## 8.5 Objeto `Rating`

**Evidência de implementação:** [services/api/models/Rating.js](../services/api/models/Rating.js)

- `resourceId` (ObjectId `Resource`, obrigatório, indexado)
- `userId` (String, obrigatório, indexado)
- `stars` (Number, obrigatório, min 1, max 5)
- `createdAt` (Date)
- `updatedAt` (Date)

**Índice composto único:** `(resourceId, userId)`.

---

## 8.6 Objeto `NewsItem`

**Evidência de implementação:** [services/api/models/NewsItem.js](../services/api/models/NewsItem.js)

- `titulo` (String, obrigatório, max 160)
- `conteudo` (String, obrigatório, max 10000)
- `publicadoEm` (Date, indexado)
- `createdBy` (String, obrigatório)

---

## 8.7 Modelo de taxonomia (removido)

- Modelo removido do serviço API para simplificação.

---

## 9) Convenções de resposta e erros (estado atual)

- **Sucesso:** mantém-se o padrão `{ ok: true, ... }`.
- **Erro (API/Auth):**  uniformizado para:

  ```json
  {
    "ok": false,
    "code": "...",
    "message": "...",
    "details": null,
    "requestId": "...",
    "error": "..."
  }
  ```

  Notas:

  - `error` é mantido por compatibilidade com clientes antigos;
  - `requestId` é propagado também no header `X-Request-Id`.
- **Ingest OAIS:** quando há erro de validação SIP, os detalhes vêm em `details` (lista de `{ code, message }`).
- **Interface Web:** já lê `message` primeiro e usa `error` como fallback.

**Evidência de implementação atual:** [services/api/lib/http.js](../services/api/lib/http.js), [services/auth/lib/http.js](../services/auth/lib/http.js), [services/api/app.js](../services/api/app.js), [services/auth/app.js](../services/auth/app.js), [services/api/oais/ingest/index.js](../services/api/oais/ingest/index.js), [services/interface/lib/web.js](../services/interface/lib/web.js)
