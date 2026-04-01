# Decisões do Projeto e Fundamentação Teórica (Proposta 1)

## 1) Contexto e fontes

Este documento regista as decisões técnicas já tomadas no projeto **Plataforma de Gestão e Disponibilização de Recursos Educativos** e a respetiva fundamentação.

Fontes usadas para justificar decisões:

1. **Projeto2026.pdf** (enunciado da UC), incluindo:
   - modelo OAIS;
   - requisitos da Proposta 1;
   - regras de ingestão, administração e disseminação;
   - perfis de utilizador e controlo de acesso.
2. **README do projeto** em `plataforma-recursos/README.md`.
3. **Boas práticas de programação** (separação de responsabilidades, segurança por defeito, validação, princípio do menor privilégio, APIs consistentes).

Data de atualização: **2026-04-01**.

---

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
- Evidência: [services/auth/middleware/auth.js](../services/auth/middleware/auth.js), [services/api/middleware/auth.js](../services/api/middleware/auth.js)

### P4. Soluções simples primeiro (MVP sólido)

- Decisão: implementar primeiro o essencial funcional (auth, ingest, access, CRUD principal), deixando otimizações para fases seguintes.
- Fundamentação: cumprir requisitos nucleares com menor risco.
- Evidência: [services/api/routes/index.js](../services/api/routes/index.js), [services/auth/routes/index.js](../services/auth/routes/index.js)

### P5. Evolução incremental e rastreável

- Decisão: manter estado no `todo.md` e documentação de decisões.
- Fundamentação: facilita auditoria técnica, apresentação e defesa do projeto.
- Evidência: [todo.md](../../todo.md), [docs/DECISOES_E_FUNDAMENTACAO.md](DECISOES_E_FUNDAMENTACAO.md)

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

### D-02 — Gateway como único ponto de entrada

**Estado:** Aprovada e implementada.

**Decisão:** expor externamente só o gateway (rota para API/Auth/Interface).

**Fundamentação:**

- Centraliza roteamento;
- Prepara terreno para CORS, rate limit e políticas transversais.

**Impacto positivo:**

- Menor superfície de ataque externa;
- Configuração de cliente simplificada.

**Evidência no código:** [services/gateway/app.js](../services/gateway/app.js)

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
- endpoint `/auth/me` para perfil autenticado.

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

**Evidência no código:** [services/auth/routes/sessions.js](../services/auth/routes/sessions.js), [services/auth/routes/index.js](../services/auth/routes/index.js), [services/auth/middleware/auth.js](../services/auth/middleware/auth.js)

---

### D-08 — Rotas admin protegidas com middleware dedicado

**Estado:** Aprovada e implementada.

**Decisão:** usar `requireAuth` + `requireAdmin` para operações administrativas.

**Fundamentação:**

- requisito de perfis do enunciado;
- menor privilégio por endpoint.

**Impacto positivo:**

- garante enforcement de regras de acesso no backend (não só na UI).

**Evidência no código:** [services/auth/routes/users.js](../services/auth/routes/users.js), [services/auth/middleware/auth.js](../services/auth/middleware/auth.js)

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

**Decisão:** modelos para `Resource`, `Post`, `Comment`, `Rating`, `NewsItem`, `Taxonomy`.

**Fundamentação:**

- cobre integralmente os objetivos funcionais descritos no enunciado.

**Impacto positivo:**

- base estável para interface e testes;
- sem overengineering.

**Evidência no código:** [services/api/models/Resource.js](../services/api/models/Resource.js), [services/api/models/Post.js](../services/api/models/Post.js), [services/api/models/Comment.js](../services/api/models/Comment.js), [services/api/models/Rating.js](../services/api/models/Rating.js), [services/api/models/NewsItem.js](../services/api/models/NewsItem.js), [services/api/models/Taxonomy.js](../services/api/models/Taxonomy.js)

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

## 6) Conclusão

O projeto já tem o **núcleo backend alinhado com o enunciado** e com decisões técnicas justificadas por OAIS, segurança e simplicidade de implementação.

A próxima fase deve concentrar-se em:

1. fechar a interface de ponta a ponta;
2. aplicar hardening de segurança mínimo;
3. consolidar com testes automáticos.

Com isso, a Proposta 1 fica não só funcional, mas também bem fundamentada para apresentação/avaliação.

---

## 7) Especificação detalhada das rotas implementadas

Esta secção documenta as rotas realmente implementadas no estado atual.

## 7.1 Serviço Auth

Base no gateway: `/auth/*`

**Ficheiros de implementação (Auth):** [services/auth/routes/index.js](../services/auth/routes/index.js), [services/auth/routes/users.js](../services/auth/routes/users.js), [services/auth/routes/sessions.js](../services/auth/routes/sessions.js), [services/auth/middleware/auth.js](../services/auth/middleware/auth.js)

### 7.1.1 `POST /auth/register`

- **Descrição:** registo público de utilizador.
- **Auth:** não.
- **Body mínimo:**
  - `nome` (string, obrigatório)
  - `email` (string, obrigatório, único)
  - `password` (string, obrigatório, mínimo 6)
  - `filiacao` (objeto opcional)
- **Regras:**
  - nível criado sempre como `consumidor`.
- **Resposta de sucesso:** `201 { ok: true, user }`.
- **Erros típicos:**
  - `400` dados em falta;
  - `409` email duplicado.

### 7.1.2 `POST /auth/sessions`

- **Descrição:** login e emissão de JWT.
- **Auth:** não.
- **Body mínimo:** `email`, `password`.
- **Resposta de sucesso:** `200 { ok: true, token, user }`.
- **Erros típicos:**
  - `400` body inválido;
  - `401` credenciais inválidas.

### 7.1.3 `GET /auth/sessions/verify`

- **Descrição:** valida token e devolve payload (uso interno entre serviços).
- **Auth:** Bearer token obrigatório.
- **Resposta de sucesso:** `200 { ok: true, payload }`.
- **Erros típicos:**
  - `401` token ausente/inválido/expirado.

### 7.1.4 `GET /auth/me`

- **Descrição:** devolve perfil do utilizador autenticado.
- **Auth:** obrigatório (`requireAuth`).
- **Resposta de sucesso:** `200 { ok: true, user }`.
- **Erros típicos:**
  - `401` token inválido;
  - `404` utilizador já não existe.

### 7.1.5 `GET /auth/users`

- **Descrição:** listagem de utilizadores.
- **Auth:** admin (`requireAuth` + `requireAdmin`).
- **Resposta:** `200 { ok: true, users }`.

### 7.1.6 `PATCH /auth/users/:id`

- **Descrição:** atualização parcial de utilizador.
- **Auth:** admin.
- **Campos aceites:** `nome`, `nivel`, `filiacao`.
- **Validação:** `nivel` em `{admin, produtor, consumidor}`.
- **Respostas:**
  - `200` atualizado;
  - `400` nível inválido;
  - `404` utilizador não encontrado.

### 7.1.7 `DELETE /auth/users/:id`

- **Descrição:** remoção de utilizador.
- **Auth:** admin.
- **Regra extra:** admin não pode remover o próprio utilizador.
- **Respostas:**
  - `200` removido;
  - `400` tentativa de auto-remoção;
  - `404` não encontrado.

---

## 7.2 Serviço API

Base no gateway: `/api/*`

**Ficheiros de implementação (API):** [services/api/routes/index.js](../services/api/routes/index.js), [services/api/middleware/auth.js](../services/api/middleware/auth.js)

### 7.2.1 Saúde

#### `GET /api/health`

- **Descrição:** healthcheck básico.
- **Auth:** não.
- **Resposta:** `{ status: 'ok' }`.

---

### 7.2.2 OAIS

**Evidência de implementação:** [services/api/oais/ingest/index.js](../services/api/oais/ingest/index.js), [services/api/oais/ingest/sip.js](../services/api/oais/ingest/sip.js), [services/api/oais/access/index.js](../services/api/oais/access/index.js), [services/api/oais/access/dip.js](../services/api/oais/access/dip.js)

#### `POST /api/oais/ingest`

- **Descrição:** ingestão SIP para AIP.
- **Auth:** `produtor` ou `admin` (`requireLevel('produtor')`).
- **Content-Type:** `multipart/form-data`.
- **Campo obrigatório:** `sip` (ficheiro ZIP).
- **Limite atual:** 100MB (`multer memoryStorage`).
- **Resposta de sucesso:** `201 { ok: true, resourceId }`.
- **Erros típicos:**
  - `400` ficheiro ausente;
  - `422` falhas de validação do SIP.

#### `GET /api/oais/access/:id`

- **Descrição:** devolve DIP (atualmente DIP=SIP).
- **Auth:** opcional (`optionalAuth`) mas com controlo por visibilidade.
- **Regras:**
  - público: acessível sem login;
  - privado: apenas admin ou produtor dono.
- **Resposta de sucesso:** stream ZIP com `Content-Type: application/zip`.
- **Erros típicos:** `400`, `401`, `403`, `404`.

---

### 7.2.3 Recursos

**Evidência de implementação:** [services/api/routes/resources.js](../services/api/routes/resources.js)

#### `GET /api/resources`

- **Descrição:** lista recursos.
- **Auth:** opcional.
- **Query params:**
  - filtros: `tipo`, `ano`, `tema`, `hashtag`;
  - paginação: `page` (default 1), `limit` (default 10, máximo 50).
- **Resposta:** `{ ok, page, limit, total, totalPages, items }`.

#### `GET /api/resources/:id`

- **Descrição:** detalhe de recurso.
- **Auth:** opcional.

#### `PATCH /api/resources/:id`

- **Descrição:** editar metadata do recurso.
- **Auth:** `produtor`/`admin` + regra de posse.
- **Body suportado:** `metadata` (objeto).

#### `DELETE /api/resources/:id`

- **Descrição:** remover recurso.
- **Auth:** `produtor`/`admin` + regra de posse.

---

### 7.2.4 Posts

**Evidência de implementação:** [services/api/routes/posts.js](../services/api/routes/posts.js)

#### `GET /api/posts`

- **Descrição:** lista posts com paginação.
- **Auth:** não.
- **Query params:** `page`, `limit` (máx 50).

#### `POST /api/posts`

- **Descrição:** criar post.
- **Auth:** `produtor`/`admin`.
- **Body mínimo:** `titulo`, `conteudo`.
- **Body opcional:** `resourceId` (se enviado, tem de existir).

#### `GET /api/posts/:id`

- **Descrição:** detalhe post.
- **Auth:** não.

#### `PATCH /api/posts/:id`

- **Descrição:** editar post.
- **Auth:** `produtor`/`admin` + dono/admin.
- **Body suportado:** `titulo`, `conteudo`.

#### `DELETE /api/posts/:id`

- **Descrição:** remover post.
- **Auth:** `produtor`/`admin` + dono/admin.

---

### 7.2.5 Comentários

**Evidência de implementação:** [services/api/routes/comments.js](../services/api/routes/comments.js)

#### `GET /api/posts/:id/comments`

- **Descrição:** listar comentários de um post.
- **Auth:** não.
- **Query params:** `page`, `limit` (default 20, máx 50).

#### `POST /api/posts/:id/comments`

- **Descrição:** criar comentário.
- **Auth:** utilizador autenticado.
- **Body mínimo:** `texto`.

#### `DELETE /api/posts/:id/comments/:cid`

- **Descrição:** remover comentário.
- **Auth:** autenticado + dono/admin.

---

### 7.2.6 Ratings

**Evidência de implementação:** [services/api/routes/ratings.js](../services/api/routes/ratings.js)

#### `POST /api/resources/:id/ratings`

- **Descrição:** criar/atualizar rating de recurso.
- **Auth:** autenticado.
- **Body mínimo:** `stars` (inteiro 1..5).
- **Regra:** um rating por `(resourceId, userId)`.

#### `GET /api/resources/:id/ratings`

- **Descrição:** estatísticas de rating.
- **Auth:** não.
- **Resposta:** `{ ok, media, total }`.

---

### 7.2.7 Notícias

**Evidência de implementação:** [services/api/routes/news.js](../services/api/routes/news.js)

#### `GET /api/news`

- **Descrição:** listar notícias com paginação.
- **Auth:** não.

#### `POST /api/news`

- **Descrição:** criar notícia.
- **Auth:** admin.
- **Body mínimo:** `titulo`, `conteudo`.

#### `DELETE /api/news/:id`

- **Descrição:** apagar notícia.
- **Auth:** admin.

---

### 7.2.8 Taxonomia

**Evidência de implementação:** [services/api/routes/taxonomy.js](../services/api/routes/taxonomy.js)

#### `GET /api/taxonomy`

- **Descrição:** listar entradas de taxonomia.
- **Auth:** não.

#### `POST /api/taxonomy`

- **Descrição:** criar entrada de taxonomia.
- **Auth:** admin.
- **Body mínimo:** `tipo`.
- **Body opcional:** `ano`, `tema`, `hashtag`.
- **Erros típicos:** `409` quando entrada igual já existe (índice único).

#### `DELETE /api/taxonomy/:id`

- **Descrição:** remover entrada de taxonomia.
- **Auth:** admin.

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

## 8.7 Objeto `Taxonomy`

**Evidência de implementação:** [services/api/models/Taxonomy.js](../services/api/models/Taxonomy.js)

- `tipo` (String, obrigatório)
- `ano` (Number, opcional)
- `tema` (String, opcional)
- `hashtag` (String, opcional)
- `createdAt` (Date)

**Índice único:** `(tipo, ano, tema, hashtag)`.

---

## 9) Convenções de resposta e erros (estado atual)

- Sucesso tende a usar: `{ ok: true, ... }`
- Erro tende a usar: `{ ok: false, error: '...' }`
- Ingest OAIS usa também formato com `errors: [{ code, message }]`

**Decisão futura recomendada:** uniformizar todos os erros para um único contrato (ex.: `code`, `message`, `details`, `requestId`).

**Evidência de padrões atuais:** [services/auth/routes/sessions.js](../services/auth/routes/sessions.js), [services/auth/routes/users.js](../services/auth/routes/users.js), [services/api/routes/resources.js](../services/api/routes/resources.js), [services/api/oais/ingest/index.js](../services/api/oais/ingest/index.js)
