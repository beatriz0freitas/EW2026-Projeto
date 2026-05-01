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

- ✅ Validação reforçada de `metadata.resource` no ingest: `tipo`, `titulo`, `visibilidade`, `ano` e `hashtags`.
- ✅ Normalização de caminhos no manifesto para impedir entradas fora de `data/`.
- ✅ Mensagens de erro de SIP traduzidas para português.
- ✅ Upload múltiplo em memória com limite de número de ficheiros e tamanho.
- ✅ PATCH de recursos deixou de substituir cegamente a metadata completa e passa a atualizar campos controlados.
- ✅ Interface mostra detalhes de erro vindos da API quando a submissão falha.
- ⚠️ A validação de metadados ainda não é um schema completo por tipo de recurso.

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
- ⚠️ Autenticações alternativas (chave API, Google, Facebook) não implementadas.

### Metainformação de recursos

- ✅ `tipo`, `titulo`, `visibilidade`, produtor e data de registo existem no fluxo/modelo.
- ✅ `subtitulo`, `descrição`, `tema`, `ano`, `hashtags` e `dataCriacao` são suportados na submissão simples.
- ✅ `ano`, `visibilidade` e `hashtags` têm validação básica.
- ⚠️ `subtitulo` e `dataCriacao` continuam opcionais.
- ⚠️ Falta um contrato de metadados mais rigoroso por tipo de recurso.

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
- ⚠️ Não há limite explícito em `express.json()` no API.
- ⚠️ Falta hardening adicional (helmet/cors explícito no gateway/rate limit central).

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
- ⚠️ Refresh token é devolvido também em JSON no login.
- ⚠️ `JWT_REFRESH_SECRET` ainda tem fallback por defeito.
- ❌ Helmet não implementado.

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

---

## 4) Backlog prioritário para fecho

### Hardening transversal

- ✅ Rate limit em POST `/auth/sessions`.
- ❌ Adicionar helmet em auth/api/gateway.
- ❌ Definir política CORS explícita no gateway.
- ❌ Rever exposição de rotas internas no gateway.

### Metadados e contratos

- ✅ Validar `visibilidade`, `ano` e `hashtags`.
- ✅ Evitar substituição total descontrolada de metadata no PATCH.
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
- Segurança de produção e testes automáticos: ❌ ainda em falta.
- Dataset de demonstração com dezenas de recursos: ⚠️ ainda insuficiente.
