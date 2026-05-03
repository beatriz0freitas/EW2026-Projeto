# Plataforma de Gestão e Disponibilização de Recursos Educativos (EW2026)

Legenda:

- ✅ Implementado
- ⚠️ Parcial / com ressalvas
- ❌ Em falta

Atualizado em: 2026-05-01

Validação desta atualização:

- ✅ Revisão do diff local e dos ficheiros novos/alterados.
- ✅ Alterações agrupadas por categoria funcional.
- ✅ Estado do backlog ajustado ao comportamento atualmente implementado.
- ✅ Templates Pug compiladas sem erro.
- ✅ JavaScript verificado com `node --check`.
- ✅ `git diff --check` sem problemas de whitespace.
- ✅ Docker Compose reconstruído e páginas `/`, `/resources` e CSS servidos com HTTP 200.

---

## 1) Alterações efetuadas por categorias

### Submissão e ingestão de recursos

- ✅ Criado fluxo de submissão simples em `/resources/new/simple`.
- ✅ Criado endpoint API `POST /api/oais/ingest/simples`.
- ✅ A submissão simples recebe metadados e ficheiros soltos e gera automaticamente um SIP BagIt.
- ✅ O SIP gerado contém `bagit.txt`, `manifest-sha256.txt`, `data/metadata.json` e os ficheiros do recurso.
- ✅ O mesmo fluxo de ingestão OAIS é usado para SIP avançado e submissão simples.
- ✅ Mantido o upload avançado de SIP ZIP para utilizadores que já têm um pacote preparado.

### Validação, segurança e contratos

- ✅ Lógica de validação de `metadata.resource` centralizada no módulo `lib/metadataValidator.js`.
- ✅ Validação coerente aplicada no SIP gerado, upload avançado de SIP ZIP e na atualização (PATCH) de recursos.
- ✅ Limites de tamanho exatos para campos como `tipo`, `titulo`, `subtitulo`, `descricao`, `tema` definidos.
- ✅ Array de `hashtags` tem validação estrita do número máximo de entradas e tamanho.
- ✅ Normalização de caminhos no manifesto para impedir entradas fora de `data/`.
- ✅ Mensagens de erro de SIP traduzidas para português.
- ✅ Upload múltiplo em memória com limite de número de ficheiros e tamanho.
- ✅ Interface mostra detalhes de erro vindos da API quando a submissão falha.

### Interface e experiência de utilização

- ✅ Formulário guiado de submissão simples com campos de metadados, ficheiros e visibilidade.
- ✅ Exemplos rápidos para dataset, artigo e slides.
- ✅ Validação visual em tempo real no formulário de submissão.
- ✅ Resumo lateral do estado dos metadados e dos ficheiros anexados.
- ✅ Detalhe de recurso mostra subtítulo, descrição, hashtags, data de criação e ficheiros submetidos.
- ✅ Listagem de recursos mantém filtros por tipo, ano, tema e hashtag.
- ✅ Home, recursos, detalhe, posts e autenticação foram adaptados para uma UI mais apelativa.
- ✅ Paleta visual revista para azul escuro, vermelho e branco, com maior contraste e hierarquia.

### Documentação e apoio

- ✅ Swagger da API atualizado com `/api/oais/ingest/simples`.
- ✅ Swagger da interface atualizado com `/resources/new/simple`.
- ✅ Criado `docs/submissao-recursos.md` com instruções de submissão.
- ✅ Criado template `services/interface/public/templates/metadados.exemplo.json`.
- ✅ Criado script/apoio de submissão em `scripts/submeter-recurso.js`.

---

## 2) Cobertura do enunciado (Proposta 1)

### Objetivos funcionais

- ✅ Disponibilizar recursos educativos de vários tipos.
- ✅ Permitir adicionar novos recursos por formulário simples ou SIP ZIP.
- ✅ Classificação por tipo, ano, tema e hashtag.
- ✅ Permitir posts sobre recursos, com associação por `resourceId`.
- ✅ Permitir comentários em posts.
- ✅ Sistema de ranking por estrelas (1..5), com média e total.

### SIP / DIP (OAIS)

- ✅ SIP em ZIP com validação BagIt simplificada.
- ✅ Validação de checksums SHA-256 e deteção de zip-slip.
- ✅ Geração automática de SIP a partir de metadados e ficheiros.
- ✅ DIP disponível por GET `/api/oais/access/:id`.
- ✅ Controlo público/privado no acesso ao DIP.

### Utilizadores e perfis

- ✅ Autenticação por username/email + password com JWT.
- ✅ Perfis admin, produtor e consumidor implementados.
- ✅ Refresh token implementado.
- ✅ Registo público força `role=consumidor`.
- ✅ Autenticações alternativas (Google, Facebook) implementadas.

### Metainformação de recursos

- ✅ `tipo`, `titulo`, `visibilidade`, produtor e data de registo existem no fluxo/modelo.
- ✅ `subtitulo`, `descrição`, `tema`, `ano`, `hashtags` e `dataCriacao` são suportados na submissão simples.
- ✅ `ano`, `visibilidade` e `hashtags` têm validação nos 3 métodos de ingestão.
- ✅ `subtitulo` e `descricao` têm validação de limites de caracteres.
- ✅ Implementado um esquema exato e rigoroso central partilhado pelo SIP e form.

### Notícias na página principal

- ✅ Notícias manuais por admin.
- ✅ Últimas notícias na home.
- ✅ Notícias automáticas de nova submissão, top3 e total de utilizadores.

### Dataset para demonstração

- ⚠️ Existem entradas reais no storage, mas ainda não atinge "dezenas".

---

## 3) Estado por serviço

### API (`services/api`)

- ✅ Estrutura modular com `models`, `routes`, `controllers`, `middleware` e `lib`.
- ✅ Swagger disponível em `/api/docs`.
- ✅ OAIS ingest e access operacionais.
- ✅ Submissão simples em `/api/oais/ingest/simples`.
- ✅ CRUD principal: resources, posts, comments, ratings e news.
- ✅ Export/import de dados globais.
- ✅ Paginação e respostas de erro centralizadas em `lib/http.js`.
- ✅ Endpoint `ratings/mine` implementado.
- ✅ Notícias de sistema com deduplicação.
- ✅ Evento automático `system.new_submission` no fim do ingest.
- ✅ Job para `system.top3` e `system.total_users`.
- ✅ Contagem de downloads por recurso.
- ✅ PATCH de resources atualiza campos permitidos da metadata.
- ✅ GET `/api/posts` aceita filtro opcional `resourceId`.
- ✅ Helmet implementado
- ❌ CORS explícito não implementado na API.
- ❌ Rate limiting não implementado na API.

### Auth (`services/auth`)

- ✅ Separação entre `routes`, `controllers`, `services`, `models`, `middleware` e `lib`.
- ✅ Middleware de acesso consolidado.
- ✅ JWT, refresh token, verify e gestão de utilizadores admin.
- ✅ Swagger disponível em `/docs` e `/auth/docs`.
- ✅ Soft-delete de utilizador (`ativo=false`).
- ✅ Hash de password com bcrypt.
- ✅ Validação dedicada para login/campos obrigatórios.
- ✅ Arranque só após ligação ao MongoDB.
- ✅ CORS configurado no auth.
- ✅ Rate limiting no login.
- ✅ Endpoints internos legados removidos para simplificar a API Auth.
- ✅ Publicacao automatica de noticia `system.total_users` quando o total de utilizadores muda (auth -> api, best-effort).
- ✅ Config valida e exige `JWT_SECRET` e `INTERNAL_SERVICE_TOKEN` no arranque.
- ⚠️ Refresh token e devolvido tambem em JSON no login (exposicao desnecessaria).
- ⚠️ `JWT_REFRESH_SECRET` ainda tem fallback por defeito; ideal exigir segredo forte por ambiente.
- ✅ Rate limiting no login implementado em POST `/auth/sessions` (in-memory por janela temporal).
- ✅ Helmet implementado.

## Gateway (services/gateway)

- ✅ Reverse proxy funcional: `/api` -> API, `/auth` -> Auth, `/` -> Interface.
- ✅ Regras especificas para `/auth/login`, `/auth/register` e `/auth/logout` irem para Interface.
- ✅ Handler central de 502 bad gateway em `lib/proxy.js`.
- ✅ `proxyTimeout` configurado (60s).
- ✅ Config centralizada em `services/gateway/lib/config.js` com validacao de `PORT`/URLs.
- ✅ Exposicao de documentacao Swagger dos servicos:
	- `/docs` -> Hub Swagger agregado
	- `/api/docs` -> API Swagger UI
	- `/auth/docs` -> Auth Swagger UI
	- `/interface/docs` -> Interface Swagger UI
- ✅ CORS explicito no gateway implementado.
- ✅ Helmet no gateway implementado.
- ❌ Rate limiting global nao implementado.
- ⚠️ Sem circuit breaker (apenas timeout e erro 502).

## Nginx (infra/nginx)

- ✅ `nginx` exposto ao exterior e a encaminhar trafego para o `gateway`.
- ✅ Compressao `gzip` ativa para respostas textuais comuns.
- ✅ Limite de upload (`client_max_body_size`) definido na borda.
- ✅ Gateway deixou de estar publicado diretamente no host e ficou apenas acessivel na rede Docker.

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

### Gateway (`services/gateway`)

- ✅ Reverse proxy funcional: `/api`, `/auth` e interface.
- ✅ Regras específicas para login, registo e logout da interface.
- ✅ Handler central de 502.
- ✅ `proxyTimeout` configurado.
- ✅ Hub Swagger agregado em `/docs`.
- ❌ CORS explícito no gateway não implementado.
- ❌ Helmet no gateway não implementado.
- ❌ Rate limiting global não implementado.
- ⚠️ Sem circuit breaker.

### Nginx (`infra/nginx`)

- ✅ `nginx` exposto ao exterior e a encaminhar tráfego para o gateway.
- ✅ Compressão `gzip` ativa.
- ✅ Limite de upload definido na borda.
- ✅ Gateway apenas acessível na rede Docker.

### Interface (`services/interface`)

- ✅ App Express com Pug, sessão, flash messages e rotas montadas.
- ✅ Login/registo/logout funcionais.
- ✅ Home com notícias recentes e recursos recentes.
- ✅ Recursos: listagem, filtros, detalhe, submissão simples, upload SIP, download DIP e ratings.
- ✅ Posts: listar, criar, detalhe, editar, apagar, comentar e remover comentário.
- ✅ Admin: utilizadores, notícias, export e import de dump.
- ✅ Interceptor 401 com renovação automática via refresh-server.
- ✅ Detalhe de recurso apresenta posts associados por `resourceId`.
- ✅ UI revista para uma experiência mais intuitiva, contrastante e consistente.
- ❌ Helmet não implementado na interface.
- ❌ CORS não implementado na interface (aceitável para SSR, mas ausente)

---

## 4) Backlog prioritário para fecho

### Hardening transversal

- ❌ Adicionar Helmet na interface.
- ❌ Adicionar CORS explícito na API.
- ❌ Rate limiting global no gateway.
- ❌ Rever exposição de rotas internas no gateway. 

### Auth — melhorias de segurança

- ⚠️ Remover refreshToken do corpo JSON do login (manter apenas em cookie HttpOnly).
- ⚠️ Exigir JWT_REFRESH_SECRET no arranque em vez de ter fallback por defeito.

### Metadados e contratos

- ⚠️ Criar schema completo de `metadata.json`.
- ⚠️ Definir regras específicas por tipo de recurso.


### Experiência funcional final

- ✅ Mostrar recursos na home.
- ✅ Mostrar posts associados no detalhe de recurso.
- ✅ Filtro GET `/api/posts?resourceId=...`.
- ✅ Submissão simples para reduzir dependência de SIP manual.
- ✅ Estilo visual mais apelativo e coerente.

### Qualidade de entrega

- ❌ Criar testes mínimos unitários para ingest e geração de SIP.
- ❌ Criar testes de integração para auth/permissões/OAIS.
- ⚠️ Aumentar dataset para dezenas de entradas reais.

---

## 5) Estado final resumido

- Núcleo da Proposta 1: ✅ funcional.
- OAIS ingest/access: ✅ funcional.
- Submissão simples com SIP automático: ✅ funcional.
- Auth com 3 perfis e controlo de acesso: ✅ funcional.
- Notícias automáticas: ✅ funcional.
- Interface end-to-end: ✅ funcional.
- UI final com azul escuro, vermelho e branco: ✅ implementada.
- Helmet e CORS na interface e CORS na API: ❌ ainda em falta.
- Rate limiting global no gateway: ❌ ainda em falta.
- Testes automáticos: ❌ ainda em falta.
- Dataset de demonstração com dezenas de recursos: ⚠️ ainda insuficiente.
