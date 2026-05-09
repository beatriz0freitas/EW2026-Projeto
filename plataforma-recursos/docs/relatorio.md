# Relatório do Projeto

## Plataforma de Recursos Educativos EW2026

---

## 1. Introdução

Este relatório documenta a solução desenvolvida para a plataforma de recursos educativos EW2026. O projeto tem como objetivo disponibilizar uma aplicação completa para submissão, preservação, consulta e disseminação de recursos educativos, integrando autenticação, perfis de utilizador, gestão administrativa, interação social e documentação técnica através de Swagger/OpenAPI.

A solução segue uma abordagem orientada a serviços. Em vez de concentrar toda a lógica numa única aplicação, o sistema foi dividido em componentes com responsabilidades específicas: `gateway`, `auth`, `api` e `interface`. Esta decisão permite separar autenticação, domínio aplicacional, interface web e encaminhamento externo, tornando o projeto mais claro, mais fácil de manter e mais próximo de uma arquitetura real de produção.

Conceptualmente, o projeto assenta no modelo OAIS, com um fluxo de preservação que distingue SIP, AIP e DIP:

- **SIP (Submission Information Package)** — o pacote submetido pelo produtor.
- **AIP (Archival Information Package)** — a representação preservada pelo sistema.
- **DIP (Dissemination Information Package)** — o pacote entregue ao consumidor no momento de acesso.

Esta distinção é fundamental porque evita tratar o ficheiro submetido como um simples upload sem semântica arquivística. O sistema valida o pacote recebido, guarda uma versão preservada com metadados e rastreabilidade, e só depois gera pacotes de disseminação a partir do arquivo.

---

## 2. Arquitetura Geral

A aplicação corre em contentores Docker, com `nginx` como ponto de entrada externo e uma rede interna partilhada pelos serviços. A base de dados usada é MongoDB, enquanto os ficheiros AIP são persistidos em disco através de um volume próprio.

Os principais componentes são:

- **nginx** — entrada pública em `localhost:16020`, responsável por encaminhar tráfego para o gateway.
- **gateway** — camada de routing público e proxy para os restantes serviços (porta 16020 interna).
- **auth** — serviço de autenticação, sessões, utilizadores e perfis (porta 16027).
- **api** — serviço principal de domínio, onde residem recursos, OAIS, posts, comentários, ratings, notícias e transferência de dados (porta 16025).
- **interface** — aplicação web server-side, construída com Express e Pug (porta 16026).
- **mongodb** — persistência documental das entidades do domínio.
- **data/aip** — armazenamento em disco dos pacotes arquivísticos preservados.

O fluxo externo típico passa pelo `nginx`, segue para o `gateway` e é encaminhado para a `interface`, `api` ou `auth` conforme a rota. Internamente, os serviços comunicam entre si através da rede Docker, por exemplo `http://api:16025` e `http://auth:16027`.

```
Utilizador
    ↓
nginx (porta 16020)
    ↓
gateway
    ├── /api/*   → api
    ├── /auth/*  → auth (rotas de API) ou interface (páginas HTML)
    └── /*       → interface

api  → MongoDB + storage AIP em disco
auth → MongoDB
```

---

## 3. Decisões Arquiteturais

### 3.1 Separação entre API, Auth e Interface

A autenticação foi isolada no serviço `auth` para concentrar num único ponto as responsabilidades de registo, login, emissão de tokens, refresh tokens, verificação de sessão e gestão de utilizadores. Isto evita espalhar lógica sensível por vários módulos.

A `api` concentra o domínio da plataforma: recursos, pacotes OAIS, fóruns, comentários, avaliações, notícias e exportação/importação de dados. Esta separação deixa claro que a API é o núcleo funcional do sistema.

A `interface` é uma aplicação web server-side que renderiza páginas HTML e gere formulários, sessões web e feedback visual. Sempre que precisa de dados ou ações, chama `auth` ou `api` por HTTP. Esta opção permitiu criar uma aplicação utilizável sem duplicar a lógica de negócio no frontend.

### 3.2 Gateway e Bloqueio de Rotas Internas

O `gateway` organiza a fronteira pública. Encaminha `/api/*`, `/auth/*` e as páginas da interface, mas bloqueia explicitamente rotas internas que não devem estar disponíveis publicamente. Por exemplo, o endpoint de publicação interna de notícias de sistema (`/api/news/system`) e o de renovação server-side de tokens (`/auth/sessions/refresh-server`) são bloqueados no gateway e protegidos adicionalmente por tokens internos nos serviços.

### 3.3 MongoDB para Metadados e Disco para AIP

O MongoDB é adequado para guardar documentos flexíveis como recursos, notícias, posts e utilizadores. Os metadados dos recursos variam conforme o tipo de recurso e encaixam bem num modelo documental.

Os ficheiros AIP são preservados em disco. Esta decisão evita guardar pacotes binários grandes diretamente na base de dados e torna o armazenamento arquivístico mais transparente. Cada recurso tem uma pasta própria com o pacote preservado, incluindo o SIP original e a estrutura `bag/`.

```
data/aip/<resourceId>/
├── bag/
│   ├── manifest.json
│   ├── bagit.txt
│   ├── checksums.txt
│   └── data/
│       └── ...
└── sip.zip
```

### 3.4 Segurança no Backend

As permissões são sempre validadas no backend. A interface pode esconder botões ou páginas, mas a decisão final pertence aos serviços. Recursos privados só podem ser acedidos pelo produtor responsável ou por administradores. Operações administrativas exigem perfil `admin`. Submissão e edição de recursos exigem `produtor` ou `admin`.

Os serviços usam JWT para autenticação e refresh token para renovação de sessão. A interface guarda uma sessão web server-side e comunica com o `auth` para verificar e renovar tokens quando necessário, de forma transparente para o utilizador.

### 3.5 Token Interno entre Serviços

A comunicação entre serviços usa um token interno partilhado (`INTERNAL_SERVICE_TOKEN`), transmitido no header `X-Internal-Token`. Este mecanismo protege endpoints que não devem ser expostos publicamente, como a publicação de notícias de sistema, a renovação de tokens server-side e os endpoints de transferência de utilizadores.

### 3.6 Documentação OpenAPI

Cada serviço expõe a sua documentação OpenAPI própria. O `gateway` disponibiliza um hub Swagger agregado em `/docs` que agrega as especificações de todos os serviços, facilitando a navegação e o teste dos endpoints.

---

## 4. Modelo de Dados e Entidades

O domínio principal gira em torno de recursos educativos e da sua preservação. As entidades principais são:

| Entidade | Descrição |
|----------|-----------|
| `User` | Utilizador autenticável, com role `admin`, `produtor` ou `consumidor`. Gerido pelo serviço `auth`. |
| `Resource` | Recurso educativo com metadados, produtor, visibilidade e contadores de download. |
| `Aip` | Registo arquivístico associado ao recurso, com validações por camada, estado, checksum e localização em disco. |
| `Post` | Publicação social associada a um recurso. |
| `Comment` | Comentário num post. |
| `Rating` | Avaliação (1–5 estrelas) de um recurso por utilizador. |
| `NewsItem` | Notícia manual ou gerada automaticamente pelo sistema. |
| `AuditLog` | Registo de auditoria de ações realizadas na plataforma. |

### Hierarquia de Perfis

```
admin (3)     → permissões máximas, acesso a tudo
  ↓
produtor (2)  → pode criar/editar/apagar os seus recursos, criar posts e comentários
  ↓
consumidor (1) → leitura de recursos públicos, avaliações
```

| Operação | Admin | Produtor | Consumidor |
|----------|-------|----------|------------|
| Ler recursos públicos | ✓ | ✓ | ✓ |
| Ler recursos privados próprios | ✓ | ✓ | — |
| Criar recursos | ✓ | ✓ | — |
| Editar/apagar recursos próprios | ✓ | ✓ | — |
| Editar/apagar recursos alheios | ✓ | — | — |
| Criar posts e comentários | ✓ | ✓ | — |
| Avaliar recursos | ✓ | ✓ | ✓ |
| Gerir utilizadores | ✓ | — | — |
| Exportar/importar dados | ✓ | — | — |

A visibilidade dos recursos é uma regra central: recursos públicos são acessíveis a qualquer pessoa; recursos privados exigem autenticação e só são acessíveis ao produtor responsável ou a administradores. Esta regra é aplicada na listagem, no detalhe e no download do DIP.

---

## 5. Fluxo OAIS: Submissão, Preservação e Acesso

### 5.1 Modos de Submissão

O sistema aceita dois modos de submissão, ambos convergindo para o mesmo processo de ingestão:

**Submissão simples** — o produtor preenche metadados e anexa ficheiros diretamente no formulário web. A API gera automaticamente um SIP BagIt a partir dos dados recebidos. Este modo é o recomendado para a maioria dos casos.

**Submissão avançada** — o produtor envia diretamente um SIP ZIP já preparado, útil para fluxos automatizados ou importações em lote.

### 5.2 Estrutura do SIP

O SIP é sempre um ZIP com a seguinte estrutura:

```
meu-recurso.zip
├── manifest.json      (obrigatório)
├── bagit.txt          (opcional)
├── checksums.txt      (opcional)
└── data/              (obrigatório)
    ├── ficheiro.pdf
    └── ...
```

O `manifest.json` contém os metadados e a lista de ficheiros:

```json
{
  "titulo": "Recurso de exemplo",
  "tipo": "artigo",
  "visibilidade": "publico",
  "hashtags": ["ensino", "exemplo"],
  "files": [
    { "name": "ficheiro.pdf", "type": "application/pdf", "required": true }
  ]
}
```

### 5.3 Validações de Ingestão

O ingest valida o SIP por quatro camadas sequenciais:

| Camada | Verificações |
|--------|-------------|
| **Estrutura** | ZIP válido, existência de `manifest.json` e pasta `data/`, ficheiros declarados presentes |
| **Metadados** | Campos obrigatórios (`titulo`, `tipo`), tipo na enumeração permitida, visibilidade válida, formatos de data |
| **Segurança** | Proteção contra zip-slip, extensões permitidas, limites de tamanho (50 MB por ficheiro, 100 MB total), nomes de ficheiro sem caracteres perigosos |
| **Consistência** | Correspondência entre `manifest.json` e ficheiros reais, verificação de checksums SHA-256 quando presentes, correspondência de tamanhos declarados |

Tipos de recurso aceites: `artigo`, `tese`, `slides`, `teste`, `relatorio`, `aplicacao`, `problema`, `outro`.

Extensões de ficheiro permitidas incluem: `.pdf`, `.txt`, `.docx`, `.xlsx`, `.csv`, `.json`, `.xml`, `.md`, `.py`, `.js`, `.html`, `.jpg`, `.png`, `.mp4`, `.zip`, entre outras.

### 5.4 Criação do AIP

Quando o SIP passa todas as validações, a API:

1. Cria um documento `Resource` em MongoDB com os metadados extraídos.
2. Cria um documento `Aip` com o relatório de validação e rastreabilidade.
3. Guarda o conteúdo extraído em `data/aip/<resourceId>/bag/`.
4. Preserva o ZIP original em `data/aip/<resourceId>/sip.zip`.

Em caso de falha após a escrita em disco, a API executa rollback automático, removendo os ficheiros e o documento `Resource` criados.

### 5.5 Geração do DIP

No download, o consumidor não recebe o ficheiro original submetido. A API constrói um DIP a partir do AIP preservado:

```
GET /api/oais/access/:resourceId
    ↓
verifica recurso e permissões de visibilidade
    ↓
lê data/aip/<resourceId>/bag/data/
    ↓
gera DIP-<resourceId>.zip com metadados.json + ficheiros
    ↓
incrementa downloadCount em resources e aips
    ↓
publica notícia de top3 se ranking mudou
```

O DIP inclui um `metadados.json` gerado pelo sistema e os ficheiros de consumo de `bag/data/`. A estrutura técnica de preservação (checksums, bagit.txt, sip.zip) não é exposta ao utilizador. É possível selecionar ficheiros individuais para download através de parâmetros de query.

---

## 6. Serviço Auth

O serviço `auth` (porta 16027) gere identidade e autenticação. Principais funcionalidades:

- Registo público de novos utilizadores (sempre com `role=consumidor`).
- Login por email ou username com validação bcrypt.
- Emissão de access token JWT (validade curta, 15 minutos por omissão) e refresh token (validade longa, 7 dias por omissão).
- Refresh token guardado em cookie HttpOnly, nunca exposto em JSON.
- Renovação de access token via `/sessions/refresh` (browser) ou `/sessions/refresh-server` (server-side, protegido por token interno).
- Verificação de token em `/sessions/verify`.
- Login/registo OAuth com Google e Facebook (quando configurados).
- Listagem, atualização e soft-delete de utilizadores por administradores.
- Publicação automática de notícia `system.total_users` quando o total de utilizadores muda.
- Registo de eventos de auditoria no serviço API para ações sensíveis (login, registo, alteração de perfil, etc.).
- Endpoints internos de exportação/importação de utilizadores para suportar a transferência de dados global.

As passwords são armazenadas com hash bcrypt e removidas de todas as respostas. O arranque exige `JWT_SECRET`, `JWT_REFRESH_SECRET` e `INTERNAL_SERVICE_TOKEN` no ambiente — sem estes valores, o serviço recusa iniciar.

---

## 7. Serviço API

O serviço `api` (porta 16025) é o núcleo de domínio. As suas áreas principais são:

### 7.1 Recursos e OAIS

A API implementa o fluxo completo OAIS: ingest (SIP → AIP) e access (AIP → DIP). Disponibiliza também CRUD sobre os metadados dos recursos (listar, consultar, editar, apagar), com controlo de visibilidade em todas as operações. A remoção de um recurso elimina em cascata os documentos AIP, ratings, posts e respetivos comentários, bem como os ficheiros em disco.

### 7.2 Posts, Comentários e Ratings

A camada social permite criar posts associados a recursos, comentar esses posts e avaliar recursos com estrelas (1–5). As operações de leitura respeitam a visibilidade do recurso associado — não é possível comentar ou avaliar um recurso privado a que o utilizador não tenha acesso.

As avaliações são únicas por utilizador/recurso (upsert). O sistema calcula a média e o total de votos, disponíveis em `GET /api/resources/:id/ratings`. O endpoint `GET /api/resources/:id/ratings/mine` permite ao utilizador consultar a sua própria avaliação.

### 7.3 Notícias Manuais e de Sistema

Existem dois tipos de notícias:

- **Manuais** — criadas por administradores via `POST /api/news`.
- **De sistema** — geradas automaticamente e publicadas via `POST /api/news/system` (endpoint interno protegido por token).

Notícias automáticas implementadas:
- `system.new_submission` — publicada quando um novo recurso público é ingerido com sucesso.
- `system.top3` — top 3 de recursos mais requisitados, calculado com base em downloads e ratings; só é republicada quando o ranking muda.
- `system.total_users` — publicada pelo serviço `auth` quando o total de utilizadores se altera.

O mecanismo de deduplicação usa o campo `dedupeKey` (com índice único no MongoDB) para evitar duplicados nas notícias de sistema.

### 7.4 Auditoria

A API mantém um registo de auditoria persistente em MongoDB (`audit_logs`). O middleware `auditHttpRequests` captura automaticamente todos os pedidos HTTP à API, inferindo a ação, o alvo e o estado a partir do método e caminho. O serviço `auth` publica eventos adicionais via `POST /api/internal/audit`.

Cada registo inclui: serviço, ação, método HTTP, caminho, estado (success/failure), código HTTP, utilizador, alvo, IP, user-agent e metadados sanitizados. Os campos sensíveis (passwords, tokens, cookies) são removidos automaticamente na sanitização.

### 7.5 Exportação e Importação

A API disponibiliza endpoints administrativos para backup e migração completa da plataforma. O dump exportado inclui recursos (com ficheiros AIP em base64), AIPs, notícias, posts, ratings, comentários e utilizadores. A importação usa upsert por `_id`, sendo idempotente.

Filtros granulares permitem exportar ou importar subconjuntos por tipo, data, produtor, visibilidade, etc. A lógica de filtros é partilhada entre a API e a interface, garantindo consistência.

---

## 8. Interface Web

A interface (porta 16026) é construída com Express e Pug, renderizando páginas HTML no servidor. As funcionalidades disponíveis são:

- Página inicial com recursos recentes e notícias.
- Login, registo e logout (com suporte a OAuth Google/Facebook quando configurado).
- Listagem de recursos com filtros por tipo, ano, tema e etiqueta.
- Detalhe de recurso com metadados, ficheiros, avaliação e posts associados.
- Formulário de submissão simples (metadados + ficheiros) e avançada (SIP ZIP).
- Download seletivo de DIP (todos os ficheiros ou seleção manual).
- Criação e consulta de posts, comentários em posts, avaliação de recursos.
- Área de administração: utilizadores, notícias, exportação/importação e auditoria.

A interface comunica com `auth` e `api` exclusivamente por HTTP. O interceptor de 401 renova automaticamente o access token via `refresh-server` sem interromper o utilizador. Os formulários de upload usam multipart, e a interface transmite os ficheiros para a API sem os processar localmente.

---

## 9. Segurança, Validação e Observabilidade

### Segurança

- `helmet` ativo em todos os serviços para headers HTTP defensivos.
- CORS configurável com lista de origens permitidas.
- Rate limiting na API e no login do `auth` (in-memory, por janela temporal).
- JWT com access token de curta duração e refresh token HttpOnly.
- Token interno entre serviços para endpoints não públicos.
- Validação de payloads e campos obrigatórios em todos os endpoints.
- Limites de tamanho e whitelist de extensões em uploads.
- Proteção contra zip-slip nos pacotes SIP.
- Soft-delete de utilizadores (o documento fica marcado como inativo, o email é anonimizado).

### Validação

O módulo `lib/metadataValidator.js` centraliza a validação do contrato de metadados `metadata.resource`, aplicado de forma consistente na submissão simples, no ingest de SIP ZIP e na atualização via PATCH. Os limites de campo são:

| Campo | Tipo | Obrigatório | Limite |
|-------|------|-------------|--------|
| `tipo` | string (enum) | Sim | máx 80 caracteres |
| `titulo` | string | Sim | máx 200 caracteres |
| `visibilidade` | enum | Sim | `publico` ou `privado` |
| `subtitulo` | string | Não | máx 200 caracteres |
| `descricao` | string | Não | máx 2000 caracteres |
| `tema` | string | Não | máx 120 caracteres |
| `ano` | inteiro | Não | 0–3000 |
| `dataCriacao` | string (data) | Não | ISO 8601 |
| `hashtags` | array | Não | máx 20 entradas, cada uma máx 80 caracteres, sem espaços |

### Observabilidade

- Health check em todos os serviços (`/health`).
- `requestId` único por pedido, propagado nos logs e nas respostas.
- Logs estruturados de todos os pedidos HTTP com método, caminho, timestamp e requestId.
- Auditoria persistente em MongoDB com filtros por ação, serviço, estado, utilizador e intervalo temporal.
- Documentação OpenAPI por serviço, com hub agregado no gateway.

---

## 10. Fluxos Principais

### 10.1 Submissão de Recurso (modo simples)

```
Produtor preenche formulário + anexa ficheiros
    ↓
Interface envia multipart para /api/oais/ingest/simples
    ↓
API constrói SIP BagIt (manifest.json + bagit.txt + checksums.txt + data/)
    ↓
Validação por 4 camadas (estrutura, metadados, segurança, consistência)
    ↓
Criação de Resource + Aip em MongoDB
Escrita em data/aip/<resourceId>/
    ↓
Publicação de notícia system.new_submission (se recurso público)
Atualização de notícia system.top3
    ↓
Interface redireciona para detalhe do recurso
```

### 10.2 Download de Recurso

```
Utilizador pede DIP (com ou sem seleção de ficheiros)
    ↓
API verifica existência do recurso
Verifica visibilidade e permissões
    ↓
Lê AIP de data/aip/<resourceId>/bag/data/
Gera ZIP DIP com metadados.json + ficheiros selecionados
    ↓
Incrementa downloadCount em Resource e Aip
Atualiza notícia system.top3 se ranking mudou
    ↓
Devolve ZIP ao cliente
```

### 10.3 Renovação Automática de Sessão

```
Interface faz pedido à API com access token expirado
    ↓
API devolve 401
    ↓
Interface chama POST /auth/sessions/refresh-server
  com X-Internal-Token e refreshToken (guardado na sessão server-side)
    ↓
Auth valida refresh token, emite novo access token
    ↓
Interface atualiza sessão e repete o pedido original
    ↓
Utilizador não percebe a renovação
```

### 10.4 Exportação e Importação de Dados

```
Admin seleciona filtros e clica "Exportar"
    ↓
Interface chama GET /api/export com filtros como query params
    ↓
API recolhe entidades de MongoDB com filtros aplicados
Pede utilizadores ao auth via /internal/transfer/users
Exporta ficheiros AIP em base64
    ↓
Devolve dump JSON com version: "2"
    ↓
--- importação noutro ambiente ---
Admin submete ficheiro de dump
    ↓
API valida version do dump
Faz upsert de resources, AIPs, posts, ratings, comments, news
Envia utilizadores para auth via /internal/transfer/users (POST)
Repõe ficheiros AIP em disco
    ↓
Devolve resultado com contadores e erros por coleção
```

---

## 11. Testes Automatizados

O projeto inclui testes unitários e de integração ligeiros em `services/api/testes/`, usando o módulo nativo `node:test` do Node.js:

| Ficheiro | Cobertura |
|----------|-----------|
| `metadataValidator.test.js` | Validação centralizada de metadados |
| `resourceAccess.test.js` | Lógica de visibilidade e controlo de acesso a recursos |
| `validateMiddleware.test.js` | Middlewares de validação de body e query |
| `uploadMiddleware.test.js` | Upload single e múltiplo com limites e tipos |
| `rateLimitApi.test.js` | Rate limiting da API |
| `autorizacao.test.js` | Middlewares `requireLevel` e `optionalAuth` |
| `simpleZip.test.js` | Criação de ZIPs e validação de caminhos |
| `pacoteSimples.test.js` | Construção automática de SIP BagIt |
| `aipStorage.test.js` | Operações sobre ficheiros AIP em disco |
| `dip.test.js` | Geração do DIP a partir do AIP |
| `transferFilters.test.js` | Filtros de exportação/importação |
| `oaisAccess.test.js` | Rota de acesso OAIS (mocks de módulos) |
| `oaisIngest.test.js` | Rota de ingestão OAIS (mocks de módulos) |

Os testes de rota usam mocking manual do cache de módulos do Node.js para isolar dependências externas (MongoDB, auth, filesystem) sem frameworks adicionais.

---

## 12. Limitações e Trabalho Futuro

As principais limitações identificadas são:

- **Helmet ausente na interface** — os headers de segurança não estão configurados no serviço `interface`.
- **Rate limiting global no gateway** — não implementado; cada serviço tem o seu próprio controlo.
- **Dataset de demonstração** — o conjunto de dados de exemplo é ainda reduzido; recomenda-se usar o script `data/povoamento/povoamento-recursos.py` para popular a plataforma.
- **Sem circuit breaker** — em caso de falha de um serviço downstream, o gateway devolve apenas um erro 502 sem mecanismo de fallback.

Melhorias possíveis a médio prazo:

- Testes de integração end-to-end para os fluxos OAIS completos.
- Armazenamento de objetos (S3-compatível) para os ficheiros AIP em vez de disco local.
- Métricas operacionais para monitorização de downloads, ingestões falhadas e atividade de utilizadores.
- Expansão do modelo de preservação com metadados PREMIS ou Dublin Core.
- Políticas de retenção e recuperação de AIP.

---

## 13. Conclusão

A plataforma EW2026 implementa uma solução completa para recursos educativos preservados segundo o modelo OAIS. A arquitetura por serviços separa claramente as responsabilidades: o `auth` gere identidade, a `api` gere domínio e preservação, a `interface` entrega a experiência web e o `gateway` organiza a entrada pública.

As decisões arquiteturais procuram equilibrar simplicidade e robustez. MongoDB guarda entidades flexíveis e pesquisáveis, enquanto o AIP fica em disco como pacote arquivístico independente. O backend concentra todas as regras de segurança e a interface atua como camada de apresentação. A auditoria persistente, a documentação Swagger por serviço e os testes automatizados contribuem para a rastreabilidade e qualidade do sistema.

O resultado é uma plataforma capaz de suportar submissão, validação, preservação, disseminação, interação social, administração e transferência de dados, mantendo uma correspondência clara com os conceitos fundamentais de Producer, SIP, Ingest, AIP, Access, DIP e Consumer do modelo OAIS.