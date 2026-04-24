# Plataforma de Gestão e Disponibilização de Recursos Educativos (EW2026)

## Lista de Tarefas — Do Início ao Fim

> **Legenda:** ✅ Concluído | ⚠️ Parcial / Precisa de correção | ❌ Por fazer

> **Objetivo do projeto (Proposta 1):** disponibilizar recursos educativos com controlo de acesso por perfil (`consumidor`, `produtor`, `admin`), ingestão OAIS (SIP→AIP), download (AIP→DIP), interação social (posts/comentários/ratings) e gestão administrativa.

> **Atualizado em:** 2026-04-06

## Resumo executivo em 12 linhas

- ✅ Arquitetura (`gateway`, `api`, `auth`, `interface`) funcional.
- ✅ Auth funcional com JWT, perfis e rotas admin protegidas.
- ✅ API funcional com OAIS essencial e domínio principal implementado.
- ✅ Gateway modularizado e ativo por routers.
- ✅ Interface funcional para auth, recursos, posts e administração.
- ✅ Upload SIP e download DIP fechados na UI (OAIS ponta-a-ponta).
- ⚠️ Filtros avançados de recursos ainda parciais na UI.
- ⚠️ Uniformização de erro em progresso (base aplicada; ainda não 100%).
- ❌ Rate limiting no login.
- ❌ `helmet` e CORS explícito.
- ❌ Testes automáticos mínimos (unit + integração).
- ❌ Fecho final de documentação e limpeza técnica residual.

---

## 0. RESUMO EXECUTIVO DO ESTADO

### 0.1 Já feito (núcleo backend funcional)

* ✅ Arquitetura de microserviços operacional (`gateway`, `api`, `auth`, `interface`)
* ✅ Serviço `auth` com registo, login JWT, validação de sessão e perfil do utilizador
* ✅ Proteção de rotas administrativas no `auth`
* ✅ Pipeline OAIS essencial (ingest + access) no `api`
* ✅ Modelos de domínio base no `api` (resources, posts, comments, ratings, news, taxonomy)
* ✅ Rotas principais de negócio da API implementadas
* ✅ JWT sem fallback inseguro no `auth` (agora obrigatório por variável de ambiente)

### 0.2 Em falta (para entrega completa e robusta)

* ⚠️ Interface web funcional base concluída (auth, recursos, posts, admin); faltam filtros avançados (OAIS UI fechado)
* ❌ Hardening de segurança (rate limit, helmet, validação/sanitização inputs, CORS)
* ❌ Testes automáticos (unitários + integração)
* ⚠️ Limpeza final técnica (feita no gateway; pendente fechar itens OAIS/rotas residuais e consolidar documentação final)

### 0.3 Atualização de padrão aplicada (2026-04-02)

**Padrão adotado (explícito):**

* ✅ Modularização por responsabilidade (routers pequenos + helpers partilhados)
* ✅ Reutilização de utilitários para reduzir duplicação
* ✅ Validação precoce (`early return`) e mensagens de erro consistentes
* ✅ Separação entre orquestração HTTP (rotas) e regras transversais (libs/middleware)

**Como foi aplicado:**

* ✅ **API**: criado helper comum (`services/api/lib/http.js`) para paginação, validação de ObjectId e resposta de erro; rotas de `resources`, `posts`, `comments`, `ratings`, `news`, `taxonomy` alinhadas ao mesmo padrão.
* ✅ **Gateway**: proxy centralizado com helper (`services/gateway/lib/proxy.js`) + routers dedicados (`routes/api.js`, `routes/auth.js`, `routes/interface.js`, `routes/index.js`).
* ✅ **Interface**: helper web (`services/interface/lib/web.js`) com `routeAsync`, guards de sessão/perfil e mapeamento de erro; páginas reais implementadas para recursos, posts e administração; `app.js` com montagem de rotas e handler global de erro.
* ✅ **Auth**: melhoria de legibilidade em `routes/users.js` com validação e construção de update extraídas para funções utilitárias.

---

## 1. INFRAESTRUTURA E CONFIGURAÇÃO

### 1.1 Ambiente e Ferramentas

* ✅ Definir estrutura de microserviços (gateway, api, auth, interface)
* ✅ Criar `docker-compose.yml` com todos os serviços + MongoDB
* ✅ Criar `Dockerfile` para cada serviço (api, auth, interface, gateway)
* ✅ Criar `.env.example` com variáveis de ambiente documentadas
* ✅ Criar `.gitignore` adequado (node_modules, .env, data/aip/*)
* ❌ Configurar Multipass para desenvolvimento local (VM Ubuntu)
* ✅ Script de bootstrap do ambiente (`setup.sh` ou `Makefile`)

**Detalhe do que falta fazer aqui:**

* ✅ Criar `Makefile` com alvos mínimos:
  * ✅ `init` (copia `.env.example` para `.env` sem sobrescrever)
  * ✅ `up` (docker compose up -d)
  * ✅ `down` (docker compose down)
  * ✅ `logs` (tail de logs)
  * ✅ `restart` (reconstruir serviços)
* ❌ Documentar pré-requisitos (Docker, Docker Compose, Node) e fluxo de arranque no `README.md`.

### 1.2 Estrutura de Pastas por Serviço

* ✅ `services/api/` — lógica de negócio
* ✅ `services/auth/` — autenticação e utilizadores
* ✅ `services/interface/` — frontend Pug
* ✅ `data/aip/` — Archival Storage (placeholder)

---

## 2. SERVIÇO AUTH

### 2.1 Modelo de Dados

* ✅ `models/User.js` — schema com nome, email, password (hash bcrypt), nivel, filiação
* ✅ Hash automático da password com `pre('save')`
* ✅ Método `checkPassword()` para validação
* ✅ `toJSON()` sem expor password

**Boas práticas já aplicadas:**

* ✅ Hash da password centralizado no modelo
* ✅ Não exposição de password nas respostas JSON
* ✅ Enum de níveis de acesso

### 2.2 Rotas de Utilizadores

* ✅ `POST /auth/register` — registo público (nível consumidor por defeito)
* ✅ `GET /auth/users` — listar utilizadores (admin)
* ✅ `PATCH /auth/users/:id` — atualizar nivel/dados (admin)
* ✅ `DELETE /auth/users/:id` — remover utilizador (admin)
* ✅ Proteção das rotas admin com middleware de autenticação/autorização

**Critérios de conclusão já atingidos:**

* ✅ Utilizador normal não consegue listar/alterar/remover utilizadores
* ✅ Admin consegue gerir utilizadores
* ✅ Registo público não permite elevação direta para admin/produtor

**Melhorias futuras recomendadas:**

* ❌ Bloquear alteração de nível do último admin do sistema
* ❌ Auditoria mínima (`updatedBy`, `updatedAt`) em alterações administrativas

### 2.3 Sessões / JWT

* ✅ `POST /auth/sessions` — login, devolve JWT
* ✅ `GET /auth/sessions/verify` — valida token (usado internamente)
* ✅ `GET /auth/me` — devolve perfil do utilizador autenticado
* ✅ `app.js` do auth com ligação ao MongoDB

**Segurança atual:**

* ✅ `JWT_SECRET` obrigatório no `auth`
* ⚠️ Falta rate limit no login
* ⚠️ Falta estratégia de refresh token / rotação (opcional para a disciplina)

---

## 3. SERVIÇO API — MIDDLEWARE

### 3.1 Middleware de Autenticação

* ✅ `requireAuth` — exige utilizador autenticado
* ✅ `requireLevel(minLevel)` — hierarquia admin > produtor > consumidor
* ✅ `optionalAuth` — não bloqueia, mas injeta `req.user` se token válido
* ✅ Verificação remota do token no serviço auth (`verifyTokenRemote`)

**Notas de qualidade:**

* ✅ Separação clara de autorização por perfil
* ⚠️ Pode evoluir para cache curta da verificação remota (performance)

---

## 4. SERVIÇO API — OAIS

### 4.1 Ingest (SIP → AIP)

* ✅ `oais/ingest/sip.js` — lógica completa de ingest
  * ✅ Extração segura do ZIP (proteção zip-slip)
  * ✅ Validação estrutura BagIt (bagit.txt, manifest, data/)
  * ✅ Validação de `metadata.json` (tipo, titulo, visibilidade)
  * ✅ Verificação de checksums SHA-256
  * ✅ Verificação de que todos os ficheiros em `data/` estão no manifest
  * ✅ Persistência do AIP em disco + registo no MongoDB
* ✅ `oais/ingest/index.js` — rota `POST /api/oais/ingest` com auth de produtor
* ⚠️ `routes/oais/ingest.js` — ficheiro duplicado/obsoleto sem auth (remover)

**Checklist de aceite do ingest (já feito):**

* ✅ ZIP inválido é rejeitado
* ✅ Estrutura BagIt incompleta é rejeitada
* ✅ `metadata.json` inválido é rejeitado
* ✅ Manifest/checksum inconsistente é rejeitado
* ✅ Ingest válido persiste em disco e Mongo

### 4.2 Access (AIP → DIP)

* ✅ `oais/access/dip.js` — localiza o ZIP do AIP em disco
* ✅ `oais/access/index.js` — rota `GET /api/oais/access/:id` com controlo de visibilidade
* ⚠️ `routes/oais/access.js` — ficheiro duplicado/obsoleto sem auth (remover)

**Checklist de aceite do access (já feito):**

* ✅ Recurso público disponível sem autenticação
* ✅ Recurso privado só para admin ou produtor dono

### 4.3 Módulos OAIS Vazios (por implementar)

* ❌ `oais/administration/index.js` — administração do repositório
* ❌ `oais/archivalStorage/index.js` — gestão do storage (AIP)
* ❌ `oais/dataManagement/index.js` — metadados, classificações, índices
* ❌ `oais/preservationPlanning/index.js` — políticas de preservação

**Escopo simples recomendado para cada módulo (MVP):**

* ❌ `administration`: endpoint de estatísticas (total AIP, total recursos, último ingest)
* ❌ `archivalStorage`: endpoint de verificação de existência/integridade de AIP
* ❌ `dataManagement`: endpoint de reindexação simples de metadados
* ❌ `preservationPlanning`: endpoint com políticas estáticas versionadas (JSON)

---

## 5. SERVIÇO API — MODELOS

* ✅ `models/Resource.js` — schema de recurso (metadata, aipPath, produtor, createdAt)
* ✅ `models/Comment.js` — comentários a posts/recursos
* ✅ `models/NewsItem.js` — notícias da página principal
* ✅ `models/Post.js` — posts sobre recursos
* ✅ `models/Rating.js` — avaliações por estrelas
* ✅ `models/Taxonomy.js` — taxonomia (ano, tipo, tema, hashtags)

**Observações de modelação:**

* ✅ Índice único em `Rating` (`resourceId + userId`) para 1 voto por utilizador
* ✅ Campos `createdAt`/`updatedAt` nas entidades principais
* ⚠️ Falta política de soft-delete (opcional)

---

## 6. SERVIÇO API — ROTAS DE NEGÓCIO

### 6.1 Recursos

* ✅ `GET /api/resources` — listar recursos (com filtros: tipo, ano, tema, hashtag) e enforcement de visibilidade
* ✅ `GET /api/resources/:id` — detalhe de um recurso com enforcement de visibilidade
* ✅ `DELETE /api/resources/:id` — remover recurso (admin ou produtor dono)
* ✅ `PATCH /api/resources/:id` — editar metadados (admin ou produtor dono)

**Validação adicional recomendada:**

* ❌ Limitar patch apenas a campos permitidos de metadata
* ❌ Validar tipos/intervalos (`ano`, `visibilidade`, etc.)

### 6.2 Taxonomia

* ✅ `GET /api/taxonomy` — listar categorias/tags disponíveis
* ✅ `POST /api/taxonomy` — criar categoria (admin)
* ✅ `DELETE /api/taxonomy/:id` — remover categoria (admin)

### 6.3 Posts

* ✅ `GET /api/posts` — listar posts
* ✅ `POST /api/posts` — criar post (produtor/admin)
* ✅ `GET /api/posts/:id` — detalhe do post
* ✅ `PATCH /api/posts/:id` — editar post (dono/admin)
* ✅ `DELETE /api/posts/:id` — remover post (dono/admin)

**Ponto de atenção:**

* ⚠️ Ao apagar post, decidir política para comentários associados (cascade ou bloqueio)

### 6.4 Comentários

* ✅ `GET /api/posts/:id/comments` — listar comentários
* ✅ `POST /api/posts/:id/comments` — adicionar comentário (autenticado)
* ✅ `DELETE /api/posts/:id/comments/:cid` — remover comentário (dono/admin)

### 6.5 Ratings

* ✅ `POST /api/resources/:id/ratings` — classificar recurso (1-5 estrelas)
* ✅ `GET /api/resources/:id/ratings` — média e total de avaliações

**Critério de negócio confirmado:**

* ✅ Novo voto do mesmo utilizador substitui voto anterior

### 6.6 Notícias

* ✅ `GET /api/news` — listar notícias (página principal)
* ✅ `POST /api/news` — criar notícia (admin)

### 6.7 Estado global da API

* ✅ Endpoints essenciais da proposta 1 implementados
* ✅ Normalização base de paginação/erro aplicada nas principais rotas (`services/api/lib/http.js`)
* ⚠️ Falta convergir **todas** as rotas (incluindo OAIS e auth) para contrato único com `code/message` e validação declarativa de payload

---

## 7. SERVIÇO GATEWAY

* ✅ `app.js` simplificado com logging uniforme e composição de rotas
* ✅ `lib/proxy.js` criado para centralizar comportamento de proxy e erro `bad_gateway`
* ✅ `routes/` agora é usado e organizado:
  * ✅ `routes/api.js` → `/api/*`
  * ✅ `routes/auth.js` → `/auth/*`
  * ✅ `routes/interface.js` → `/*`
  * ✅ `routes/index.js` agrega os routers

**Pendente no gateway:**

* ❌ Política CORS explícita
* ❌ `helmet` para hardening de headers

---

## 8. SERVIÇO INTERFACE (Frontend Pug)

### 8.1 Configuração Base

* ✅ `app.js` configurado com Pug + `express-session` + static + parsing de forms
* ✅ Helper HTTP para chamadas a auth/api (`services/interface/lib/http.js`)
* ✅ Helper web transversal (`services/interface/lib/web.js`) com guards e `routeAsync`
* ✅ Middleware de injeção do utilizador em `res.locals`

**MVP sugerido para fechar rapidamente:**

* ✅ Header com estado de autenticação (`Entrar`, `Registar`, `Logout`)
* ✅ Home com bloco de notícias recentes
* ✅ Fluxo de login/registo funcional ponta-a-ponta

### 8.2 Layout e Estilos

* ✅ `views/layout.pug` com navbar dinâmica, flash messages e footer
* ✅ `public/stylesheets/style.css` com componentes para tabelas, listas, formulários e ações

**Critério mínimo de UX:**

* ✅ Layout consistente em todas as páginas principais
* ✅ Mensagens de sucesso/erro visíveis ao utilizador
* ✅ `routes/auth.js` + `views/auth/login.pug` — formulário de login
* ✅ `routes/auth.js` + `views/auth/register.pug` — formulário de registo
* ✅ Logout (limpar sessão/cookie)

**Fluxos obrigatórios:**

* ✅ login válido redireciona para home
* ✅ logout invalida sessão local

### 8.4 Página Principal

* ⚠️ `routes/index.js` + `views/index.pug` implementados com notícias e atalhos; listagem de recursos na home ainda simplificada

**Componente mínimo:**

* ❌ cartões de recurso (título/tipo/visibilidade) diretamente na home

### 8.5 Recursos (Interface)

* ⚠️ `routes/resources.js` + `views/resources/list.pug` — lista funcional (sem filtros avançados)
* ✅ `routes/resources.js` + `views/resources/detail.pug` — detalhe funcional + classificação + download DIP
* ✅ `routes/resources.js` + `views/resources/form.pug` — upload SIP funcional

**Regras de acesso no frontend:**

* ✅ botão upload só para `produtor/admin` com submissão real
* ✅ download de privado só quando autenticado e autorizado via fluxo DIP

### 8.6 Posts (Interface)

* ✅ `routes/posts.js` + `views/posts/list.pug` — lista de posts
* ⚠️ `routes/posts.js` + `views/posts/detail.pug` — detalhe + comentários (base funcional)
* ✅ `routes/posts.js` + `views/posts/form.pug` — criar post

**MVP social:**

* ✅ listar posts por data (ordem do backend)
* ✅ comentar post autenticado
* ⚠️ editar/apagar apenas do próprio autor (ou admin) — apagar implementado via backend; edição na UI ainda pendente

### 8.7 Área de Administração (Interface)

* ✅ `routes/admin.js` + `views/admin/users.pug` — gestão de utilizadores
* ✅ `routes/admin.js` + `views/admin/news.pug` — gestão de notícias

**Guardas obrigatórias:**

* ✅ rotas `/admin/*` bloqueadas para não-admin

---

## 9. SEGURANÇA E QUALIDADE

* ❌ Rate limiting nas rotas de login (proteger contra brute force)
* ❌ Validação e sanitização de inputs (express-validator ou joi)
* ❌ Cabeçalhos de segurança HTTP (helmet)
* ❌ CORS configurado no gateway
* ✅ JWT_SECRET obrigatório via variável de ambiente (sem fallback inseguro no auth)
* ✅ Paginação nas listagens (recursos, posts, comentários)

**Backlog de segurança por prioridade:**

1. ❌ Rate limit em `POST /auth/sessions`
2. ❌ `helmet` no `api`, `auth`, `gateway`
3. ❌ Validação de payload com `express-validator`
4. ❌ Sanitização básica para campos de texto
5. ❌ Política CORS explícita no gateway

---

## 10. TESTES

* ❌ Testes unitários ao ingest SIP (sip.js)
* ❌ Testes de integração às rotas da API (auth, resources, posts)
* ❌ Teste de criação de SIP válido (script auxiliar)
* ❌ Teste de acesso a recurso público vs privado

**Plano de testes mínimo (entrega):**

* ❌ 1 teste unitário de validação de `metadata.json`
* ❌ 1 teste unitário de checksum
* ❌ 1 integração login + acesso a rota protegida
* ❌ 1 integração permissões admin (`/auth/users`)
* ❌ 1 integração acesso público/privado no OAIS access

---

## 11. CORREÇÕES IDENTIFICADAS NO CÓDIGO ATUAL

### 11.1 Ficheiros duplicados / conflito de rotas

* ✅ `services/api/routes/oais/ingest.js` removido (duplicado inseguro)
* ✅ `services/api/routes/oais/access.js` removido (duplicado inseguro)
* ⚠️ `services/api/routes/index.js` — já aponta para `oais/ingest` e `oais/access` corretamente, mas os ficheiros em `routes/oais/` criam confusão

### 11.2 Interface placeholder\

* ✅ `services/interface/app.js` — Pug + sessões + rotas reais montadas

### 11.3 Rotas de admin sem proteção

* ✅ `GET /auth/users` e `PATCH /auth/users/:id` estão protegidas e verificam perfil admin

### 11.4 `routes/index.js` não usa os ficheiros em `routes/`

* ✅ Situação resolvida: `routes/resources.js`, `routes/posts.js` e `routes/admin.js` estão implementados e registados no `app.js` da interface

---

## 12. CRITÉRIOS DE "DONE" PARA FECHAR A PROPOSTA 1

Para considerar o projeto completo a nível funcional:

* ✅ Utilizador consegue registar, autenticar e terminar sessão pela interface
* ✅ Produtor consegue submeter SIP e ver recurso na listagem
* ✅ Consumidor consegue pesquisar recursos, consultar detalhe e descarregar DIP (quando permitido)
* ✅ Recurso privado respeita permissões no backend e no fluxo frontend de DIP
* ✅ Admin consegue gerir utilizadores e notícias pela interface
* ❌ Existem testes mínimos de regressão para auth + OAIS + permissões

---

## ORDEM RECOMENDADA PARA CONTINUAR

1. **Completar UX funcional** (filtros avançados em recursos + edição de posts na interface)
2. **Segurança essencial** (rate limit, helmet, validação input, CORS)
3. **Testes mínimos automáticos** (unit + integração)
4. **Refino final** (docs, scripts e limpeza técnica final)

---

## 13. PLANO DE EXECUÇÃO DETALHADO (PRÓXIMOS PASSOS EXATOS)

> Objetivo: fechar a Proposta 1 com o menor risco possível, por incrementos pequenos, sempre com critérios de aceite claros.

### BLOCO A — Interface base (fundação)

**Ficheiros alvo diretos:**

* `services/interface/app.js`
* `services/interface/package.json`
* `services/interface/routes/index.js`
* `services/interface/routes/auth.js`
* `services/interface/views/layout.pug`
* `services/interface/views/index.pug`
* `services/interface/views/auth/login.pug`
* `services/interface/views/auth/register.pug`
* `services/interface/public/stylesheets/style.css`

**Tarefas exatas:**

1. ✅ Configurar app Express com `view engine` Pug, `views`, static files e parser de formulários.
2. ✅ Adicionar gestão de sessão (cookie HTTP-only) para guardar token JWT da interface.
3. ✅ Criar helper central para chamadas ao `auth` e `api` com token da sessão.
4. ✅ Middleware global para injetar `user` em `res.locals`.
5. ✅ Implementar páginas e fluxos de autenticação:

* GET/POST login
* GET/POST registo
* POST/GET logout

6. ✅ Criar layout base com navbar dinâmica por estado de login (`Entrar/Registar` vs `Logout/Área`), zona de mensagens e rodapé.

**Critérios de aceite (DoD do Bloco A):**

* ✅ Aceder a `/` já renderiza Pug (não placeholder texto).
* ✅ Utilizador consegue registar e login pela interface.
* ✅ Sessão persiste entre pedidos e logout limpa sessão.
* ✅ Navbar mostra links diferentes para autenticado vs anónimo.

---

### BLOCO B — Home + Recursos (fluxo principal do utilizador)

**Ficheiros alvo diretos:**

* `services/interface/routes/index.js`
* `services/interface/routes/resources.js`
* `services/interface/views/index.pug`
* `services/interface/views/resources/list.pug`
* `services/interface/views/resources/detail.pug`
* `services/interface/views/resources/form.pug`

**Tarefas exatas:**

1. ⚠️ Página inicial com:

* ❌ recursos recentes (`GET /api/resources`) na home
* ✅ notícias recentes (`GET /api/news`)

2. ⚠️ Lista de recursos com paginação (filtros avançados pendentes).
3. ✅ Detalhe de recurso com botão para download DIP (`/api/oais/access/:id`).
4. ✅ Formulário de upload SIP (multipart, campo `sip`) visível só para `produtor/admin`.
5. ✅ Tratamento amigável de erros base implementado.

**Critérios de aceite (DoD do Bloco B):**

* ✅ Consumidor vê recursos públicos e detalhe; download DIP disponível conforme permissões.
* ✅ Produtor autenticado consegue submeter SIP via interface.
* ⚠️ Paginação funcional; filtros avançados ainda pendentes.

---

### BLOCO C — Posts, Comentários e Administração

**Ficheiros alvo diretos:**

* `services/interface/routes/posts.js`
* `services/interface/routes/admin.js`
* `services/interface/views/posts/list.pug`
* `services/interface/views/posts/detail.pug`
* `services/interface/views/posts/form.pug`
* `services/interface/views/admin/users.pug`
* `services/interface/views/admin/news.pug`

**Tarefas exatas:**

1. ✅ Listar posts e detalhe de post.
2. ⚠️ Criar/apagar post para `produtor/admin` (edição na UI pendente).
3. ✅ Comentar post para utilizador autenticado.
4. ❌ Remover comentário por dono/admin (ação dedicada na UI pendente).
5. ✅ Área admin com:

* gestão de utilizadores (`GET/PATCH/DELETE /auth/users`)
* gestão de notícias (`GET/POST/DELETE /api/news`)

6. ✅ Guardas de rota na interface para `/admin/*` (redirecionar não-admin).

**Critérios de aceite (DoD do Bloco C):**

* ⚠️ Fluxo social maioritariamente disponível na UI (edição de post e remoção de comentário pendentes).
* ✅ Admin consegue gerir utilizadores e notícias sem usar Postman.

---

### BLOCO D — Segurança essencial e consistência de API

**Ficheiros alvo diretos:**

* `services/auth/package.json`
* `services/auth/app.js`
* `services/auth/routes/sessions.js`
* `services/api/package.json`
* `services/api/app.js`
* `services/gateway/package.json`
* `services/gateway/app.js`

**Tarefas exatas:**

1. ❌ Adicionar `helmet` em `auth`, `api` e `gateway`.
2. ❌ Adicionar rate limiting no login (`POST /auth/sessions`).
3. ❌ Definir política CORS explícita no gateway.
4. ❌ Adicionar validação/sanitização mínima dos payloads mais críticos.
5. ❌ Uniformizar formato de erro (`{ ok:false, code, message }`) nas rotas principais.

**Critérios de aceite (DoD do Bloco D):**

* ❌ Limites ativos no login (mitigação brute force).
* ❌ Headers de segurança presentes nas respostas.
* ❌ Erros com formato consistente em auth/api.

---

### BLOCO E — Testes automáticos mínimos + limpeza final

**Ficheiros alvo diretos (novos/alterados):**

* `services/api/package.json` (scripts de teste)
* `services/auth/package.json` (scripts de teste)
* `services/api/oais/ingest/sip.js` (testabilidade)
* pasta de testes em `services/api/` e `services/auth/`
* `services/gateway/routes/*` (limpeza de ficheiros vazios, se não usados)
* `README.md` e `plataforma-recursos/README.md`

**Tarefas exatas:**

1. ❌ Criar testes unitários para validação de `metadata.json` e checksums do ingest.
2. ❌ Criar testes de integração para:

* login + rota protegida
* permissões admin em `/auth/users`
* acesso público/privado em OAIS access

3. ❌ Limpar artefactos vazios/obsoletos (ex.: `services/gateway/routes/*` se não usados).
4. ❌ Atualizar documentação final com passos de execução e testes.

**Critérios de aceite (DoD do Bloco E):**

* ❌ Suite mínima de testes corre sem falhas.
* ❌ README permite a qualquer colega correr o projeto em ambiente limpo.
* ❌ Critérios de Done da secção 12 ficam todos concluídos.

---

## 14. PRIORIZAÇÃO OPERACIONAL (EXECUTAR NESTA ORDEM)

1. **Bloco A** — sem isto, não há interface utilizável.
2. **Bloco B** — fecha fluxo principal de recursos (core da proposta 1).
3. **Bloco C** — fecha interação social e gestão administrativa.
4. **Bloco D** — endurece segurança e estabiliza contratos.
5. **Bloco E** — garante qualidade, repetibilidade e entrega final.

---

## 15. PRINCÍPIOS DE IMPLEMENTAÇÃO A APLICAR EM CADA PASSO

* ✅ **Separação de responsabilidades:** rota fina, lógica em helpers/serviços.
* ✅ **Falhar cedo:** validar input antes de tocar em DB/storage.
* ✅ **Menor privilégio:** autorização por perfil e por posse sempre no backend.
* ✅ **Consistência de contrato:** respostas e erros com formato previsível.
* ✅ **Incremento pequeno:** concluir bloco a bloco com DoD explícito.
