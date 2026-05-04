# Apoio de Implementação e Decisão

> Objetivo: resumo executivo de como a solução cumpre o enunciado.
>
> Atualizado em: 2026-05-04

## 1) O que o enunciado pede

Os pontos essenciais a cobrir são:

- fluxo OAIS: Producer → SIP → Ingest → AIP → Access → DIP → Consumer;
- gestão de recursos educativos com pesquisa, detalhe e disponibilização;
- autenticação e perfis `admin`, `produtor` e `consumidor`;
- criação de posts, comentários e ratings sobre recursos;
- controlo de acesso a recursos públicos e privados;
- interface web para usar o sistema de ponta a ponta;
- Swagger/documentação para facilitar teste e validação.

## 2) Estado atual da solução

### Arquitetura

- A solução está dividida em `gateway`, `auth`, `api` e `interface`.
- O `nginx` fica exposto ao exterior e encaminha para o `gateway`.
- O `gateway` faz o routing funcional para API, Auth e Interface.

### API

- O serviço API já cobre ingestão OAIS, acesso, recursos, posts, comentários, ratings e notícias.
- O ingest aceita SIP em ZIP com validações básicas de estrutura e integridade.
- O access devolve DIP e respeita visibilidade pública/privada.
- A API expõe Swagger em `/api/docs`.

### Auth

- O serviço Auth trata registo, login, refresh token, verificação de sessão e gestão de utilizadores.
- Os perfis `admin`, `produtor` e `consumidor` já existem no backend.
- A password é guardada com hash e não é devolvida nas respostas.
- O Auth expõe Swagger em `/docs`.

### Interface

- A Interface permite login, registo, consulta de recursos, upload SIP, download DIP, posts, comentários e administração básica.
- A renovação de token é tratada de forma automática quando necessário.
- A Interface expõe Swagger em `/interface/docs`.

### 3) Decisões tomadas e respetiva justificação

### Separação por serviços

Escolhi separar a solução em serviços porque reduz acoplamento, facilita manutenção e torna o projeto mais claro para demonstrar. Em vez de um monólito grande, cada componente tem uma responsabilidade simples e bem definida.

### `nginx` + `gateway`

Mantive o `nginx` como entrada externa e o `gateway` como ponto lógico da aplicação. Isto permite ter uma borda técnica mais limpa, sem perder o routing já implementado e sem espalhar regras por vários sítios.

### MongoDB + storage em disco

Usei MongoDB para metadados e entidades do domínio, e disco para os ficheiros AIP. Esta divisão é mais natural para OAIS: os dados descritivos ficam pesquisáveis e o conteúdo arquivístico fica guardado como ficheiro.

### DIP gerado a partir do AIP

O SIP submetido pelo produtor é validado e convertido num AIP persistido em disco, com rastreabilidade própria no MongoDB. Quando um utilizador descarrega o recurso, o DIP é gerado a partir desse AIP preservado, e não devolvido diretamente como o ZIP de entrada.

### Segurança no backend

As decisões de acesso são validadas no backend e não apenas na interface. Isto evita depender da UI para segurança e garante que o sistema continua protegido mesmo com pedidos diretos à API.

### JWT + refresh token

Optei por JWT com refresh token porque funciona bem numa arquitetura distribuída e evita sessão pesada no servidor. A interface consegue renovar automaticamente o acesso sem obrigar o utilizador a voltar a autenticar-se a cada expiração.

## 4) O que não foi escolhido e porquê

- Não foi escolhida uma arquitetura monolítica porque dificultaria evolução e depuração.
- Não foi colocada toda a lógica de segurança na interface porque isso seria frágil e facilmente contornável.
- Não foi feita uma transformação semântica complexa do conteúdo do DIP, mas o download já passa pela conversão AIP -> DIP, garantindo que o pacote servido vem do arquivo preservado.
- Não foram introduzidos provedores externos de autenticação porque o enunciado pode ser cumprido com autenticação local simples e direta.
- Não foram adicionadas otimizações prematuras ou padrões excessivos porque o foco foi cumprir o essencial com estabilidade.

## 5) Limitações atuais

- faltam testes mínimos de unidade e integração;
- faltam algumas medidas de hardening transversal;
- a validação de metadados ainda pode ser reforçada;
- o dataset de demonstração ainda pode crescer.

---

# Guia Detalhado de Implementação e Decisões

## 1) Upload/Download de Pacotes (SIP/DIP)

Guia detalhado do formato atual: [docs/oais-sip-aip-dip.md](oais-sip-aip-dip.md).

### Upload (SIP)

**Fluxo:**

1. O cliente faz POST `/api/oais/ingest` com um ficheiro ZIP no campo multipart `sip`.
2. O serviço API valida se é um ZIP válido.
3. O ZIP é extraído para uma pasta temporária.
4. O SIP é validado por camadas: estrutura, metadados, segurança e consistência.
5. Se válido, o conteúdo extraído é guardado como AIP em `data/aip/<resourceId>/bag/` e o ZIP original é preservado em `data/aip/<resourceId>/sip.zip`.
6. São criados registos em MongoDB nas coleções `resources` e `aips`.

**Validações de SIP:**

- Ficheiro tem de ser um ZIP válido.
- Estrutura obrigatória: `manifest.json` na raiz e pasta `data/`.
- Ficheiros de raiz permitidos: `manifest.json`, `bagit.txt` e `checksums.txt`.
- `manifest.json` tem de conter pelo menos `titulo` e `tipo`.
- `tipo` tem de pertencer à enumeração: `artigo`, `tese`, `slides`, `teste`, `relatorio`, `aplicacao`, `problema`, `outro`.
- `visibilidade` tem de ser `publico` ou `privado`; por defeito é `publico`.
- Os ficheiros declarados em `manifest.json.files` têm de existir em `data/`.
- Se `checksums.txt` existir, os checksums SHA-256 são verificados contra os ficheiros em `data/`.
- Proteção contra "zip-slip" (caminhos maliciosos dentro do ZIP).
- Whitelist de extensões e limites de tamanho por ficheiro/pacote.

**Permissões:**

- Apenas utilizadores com role `produtor` ou `admin` podem fazer upload.
- O ID do produtor fica registado no campo `produtor` do recurso.

**Código relevante:**

- [services/api/oais/ingest/sip.js](../services/api/oais/ingest/sip.js): validação estrutural
- [services/api/oais/ingest/index.js](../services/api/oais/ingest/index.js): rota POST

### Download (DIP)

**Fluxo:**

1. Cliente faz GET `/api/oais/access/<resourceId>`.
2. O serviço verifica se o recurso existe.
3. Verifica visibilidade:
   - Se `publico`: qualquer pessoa pode descarregar.
   - Se `privado`: só o produtor que submeteu ou um admin.
4. Gera um ZIP DIP a partir da pasta AIP guardada em disco.
5. Incrementa `downloadCount` no recurso e no registo AIP.

**Dados devolvidos:**

- O `Content-Disposition` define o nome do ficheiro.
- O `Content-Type` é `application/zip`.
- O DIP contém o AIP preservado, incluindo `bag/` e `sip.zip`.

**Código relevante:**

- [services/api/oais/access/dip.js](../services/api/oais/access/dip.js): busca o ficheiro
- [services/api/oais/access/index.js](../services/api/oais/access/index.js): rota GET

---

## 2) Operações CRUD de Recursos

### CREATE (via Upload SIP)

O recurso é criado automaticamente durante o ingest do SIP

### READ

**GET /api/resources**

- Lista recursos com paginação.
- Suporta filtros opcionais:
  - `ano`: ano de produção do recurso.
  - `page` / `limit`: paginação.
- Apenas mostra recursos públicos ou recursos privados do utilizador autenticado.
- Responde com `{ ok: true, data: [...], total, page, limit }`.

**GET /api/resources/:id**

- Devolve um recurso completo (metadados, referências AIP).
- Valida visibilidade antes de devolver.

### UPDATE (PATCH)

**PATCH /api/resources/:id**

- Permite editar metadados de um recurso.
- Requer role `produtor` ou `admin`.
- Só o produtor que criou ou um admin podem editar.
- Atualiza o campo `updatedAt`.

### DELETE

**DELETE /api/resources/:id**

- Remove o registo de MongoDB.
- Remove a pasta AIP em disco (`data/aip/<resourceId>/`).
- Requer role `produtor` ou `admin`.
- Só o produtor ou admin podem apagar.

**Permissões gerais (CRUD):**

```
consumidor   → ler públicos
produtor    → ler públicos + ler/criar próprios privados, editar próprios, apagar próprios
admin       → ler tudo, editar tudo, apagar tudo
```

---

## 3) Conversão SIP → AIP → DIP (OAIS)

### SIP (Submission Information Package)

**O que é:**
Um ficheiro ZIP que o produtor envia contendo o recurso a ser arquivado.

**Estrutura esperada:**

```
recurso.zip
├── manifest.json             (metadados e lista de ficheiros)
├── bagit.txt                 (opcional; marcador BagIt)
├── checksums.txt             (opcional; SHA-256 dos ficheiros)
├── data/                     (conteúdo do recurso)
│   ├── ficheiro1.pdf
│   ├── imagem.jpg
│   └── ...
```

**manifest.json obrigatório:**

```json
{
  "titulo": "Título do Recurso",
  "subtitulo": "Subtítulo opcional",
  "tipo": "artigo",
  "hashtags": ["web", "programacao"],
  "visibilidade": "publico",
  "dataCriacao": "2026-03-01",
  "descricao": "Descrição do recurso",
  "files": [
    {
      "name": "ficheiro1.pdf",
      "size": 2048000,
      "type": "application/pdf",
      "required": true
    }
  ]
}
```

### AIP (Archival Information Package)

**O que é:**
O SIP validado é transformado num AIP. O sistema guarda a cópia extraída em `bag/`, preserva o `sip.zip` original e cria um registo de rastreabilidade na coleção `aips`.

**Localização em disco:**

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

**Por que em disco e não só em MongoDB:**

- OAIS separa dados descritivos (metadados em DB) de conteúdo (ficheiros em storage).
- Ficheiros binários grandes são ineficientes em MongoDB.
- Permite backup e recuperação independente.

**Decisão de design:**

- Metadados ficam em MongoDB (searchable, rápido).
- Conteúdo fica em disco (escalável, durável).

### DIP (Dissemination Information Package)

**O que é:**
O pacote enviado ao utilizador quando descarrega.

**Implementação atual:**
O DIP é um ZIP gerado no momento do download a partir da pasta AIP guardada em disco.

**Por que esta opção:**

- Cumpre a conversão AIP -> DIP pedida no enunciado.
- Mantém a rastreabilidade do que foi ingerido.
- Permite evoluir futuramente para DIPs filtrados, anonimizados, normalizados ou adaptados ao perfil do consumidor.

---

## 4) Autenticação

### Modelo de Autenticação

**Tipo:** JWT (JSON Web Token) + refresh token

### Fluxo de Login

1. Cliente faz POST `/auth/sessions` com `username` / `email` e `password`.
2. O serviço Auth:
   - Busca o utilizador em MongoDB.
   - Valida a password com bcrypt.
   - Gera um JWT curta vida (access token) e um refresh token de vida longa.
   - Envia o refresh token em cookie HttpOnly.
3. Devolve:
   ```json
   {
     "ok": true,
     "token": "<jwt-access-token>",
     "user": { "sub": "userId", "nome": "...", "role": "produtor", ... }
   }
   ```

### Verificação de Token

**POST /sessions/verify (no Auth):**

- O cliente envia o JWT no header `Authorization: Bearer <token>`.
- O serviço Auth descodifica e valida a assinatura.
- Se válido, devolve o payload do JWT.

### Renovação de Token

**POST /sessions/refresh-server (no Auth):**

- A Interface guarda na sessão server-side o refresh token recebido via `Set-Cookie` do Auth.
- Quando o access token expira (HTTP 401), a Interface chama este endpoint com o refresh token.
- O endpoint exige `X-Internal-Token`, por isso fica reservado a chamadas internas entre serviços.
- Se válido, devolve um novo access token.

### Extração de Token (API)

O middleware da API extrai o token por ordem de precedência:

1. Header `Authorization: Bearer <token>`.
2. Cookie `ew.auth` (definido pelo gateway).
3. Query string `?token=...` (para compatibilidade).

**Código:**

- [services/api/middleware/auth.js](../services/api/middleware/auth.js): extração e verificação
- [services/auth/routes/sessions.js](../services/auth/routes/sessions.js): geração de tokens

### Modelo de Roles e Permissões

**Hierarquia:**

```
admin (3)     → permissões máximas
  ↓
produtor (2)  → pode criar/editar próprios recursos
  ↓
consumidor (1) → apenas leitura de públicos
```

**Middleware `requireLevel(minLevel)`:**

- Verifica se `userRank >= minRank`.
- Exemplos:
  - `requireLevel('produtor')` aceita produtor e admin.
  - `requireLevel('admin')` aceita só admin.

---

## 5) Exportação e Importação

### Export (GET /api/export)

**Permissão:** Apenas admin.

**O que exporta:**

- Todos os recursos (metadados + ficheiros AIP em base64).
- Todos os posts.
- Todos os comentários.
- Todos os ratings.
- Todas as notícias.

**Formato:**

```json
{
  "ok": true,
  "timestamp": "2026-04-28T...",
  "entities": {
    "resources": [
      {
        "_id": "...",
        "metadata": {...},
        "produtor": "...",
        "aipContent": { ... base64 ficheiros ... }
      },
      ...
    ],
    "posts": [...],
    "comments": [...],
    "ratings": [...],
    "news": [...]
  }
}
```

**Por que base64:**

- Permite guardar ficheiros binários em JSON.
- Facilita transferência de dados.
- Permite restore completo fora de MongoDB.

### Import (POST /api/import)

**Permissão:** Apenas admin.

**Entrada:**

- JSON direto no body, ou
- Ficheiro `dumpFile` em multipart/form-data.

**Estratégia:**

- Upsert por `_id`: se já existe, atualiza; se não, insere.
- Idempotente: pode ser chamado várias vezes.
- Restaura ficheiros AIP do base64 para disco.

**Por que export/import:**

- Backup e restauro total da plataforma.
- Migração entre ambientes.
- Auditoria de dados.
- Recuperação de desastres.

**Código:**

- [services/api/routes/export.js](../services/api/routes/export.js): rotas
- [services/api/controllers/exportController.js](../services/api/controllers/exportController.js): lógica

---

## 6) Classificação de Recursos

### Esquema de Taxonomia

Os recursos são classificados através de campos em `metadata.resource`, derivados do `manifest.json` do SIP:

```json
{
  "resource": {
    "tipo": "artigo",
    "ano": 2023,
    "tema": "história",
    "hashtags": ["#história", "#século-XX"]
  }
}
```

### Dimensões de Classificação

| Dimensão          | Tipo   | Obrigatório | Exemplos                          |
| ------------------ | ------ | ------------ | --------------------------------- |
| **tipo**     | string | Sim          | artigo, tese, slides, teste       |
| **ano**      | number | Não         | 2023, 1945                        |
| **tema**     | string | Não         | história, tecnologia, educação |
| **hashtags** | array  | Não         | ["#história", "#XX"]             |

### Filtros Suportados

**GET /api/resources** aceita:

- `ano=2023`: recursos daquele ano.
- `page=1&limit=10`: paginação.

**Em futuro:**

- Filtros por `tipo`, `tema`, `hashtags` via query.

### Por que esta abordagem

- **Flexibilidade:** campos em `metadata.resource` permitem adicionar novos dados descritivos sem migrar schema.
- **Simplicidade:** não precisa de tabela de referência separada.
- **Compatibilidade OAIS:** metadados descritivos ficam no SIP.

**Código:**

- [services/api/models/Resource.js](../services/api/models/Resource.js): modelo
- [services/api/lib/dataTransferFilters.js](../services/api/lib/dataTransferFilters.js): filtros em export/import

---

## 7) Posts e Comentários

### Post (Comentário sobre um Recurso)

**Modelo:**

```javascript
{
  _id: ObjectId,
  titulo: string,          // max 160 chars
  conteudo: string,        // max 20000 chars
  resourceId: ObjectId,    // referência ao recurso (opcional)
  autorId: string,         // ID do utilizador (do Auth)
  autorNome: string,
  createdAt: Date,
  updatedAt: Date
}
```

**CRUD:**

- **CREATE:** POST `/api/posts`, requer `produtor`.
- **READ:** GET `/api/posts` (lista) / GET `/api/posts/:id` (detalhe).
- **UPDATE:** PATCH `/api/posts/:id`, só autor ou admin.
- **DELETE:** DELETE `/api/posts/:id`, só autor ou admin.

**Regras:**

- Um post pode estar associado a um `resourceId`.
- Permite comentários sobre um recurso específico.
- A interface mostra posts associados na página de detalhe do recurso.

### Comment (Comentário sobre um Post)

**Modelo:**

```javascript
{
  _id: ObjectId,
  postId: ObjectId,        // referência ao post
  autorId: string,
  autorNome: string,
  texto: string,           // max 5000 chars
  createdAt: Date
}
```

**CRUD:**

- **CREATE:** POST `/api/posts/:postId/comments`.
- **READ:** GETs implícitos via posts.
- **DELETE:** DELETE `/api/comments/:id`, só autor ou admin.

**Permissões:**

- Apenas `produtor` e `admin` podem comentar.
- `consumidor` pode ler mas não comentar.

**Código:**

- [services/api/models/Post.js](../services/api/models/Post.js)
- [services/api/models/Comment.js](../services/api/models/Comment.js)
- [services/api/routes/posts.js](../services/api/routes/posts.js)
- [services/api/routes/comments.js](../services/api/routes/comments.js)

---

## 8) Utilizadores

### Modelo

```javascript
{
  _id: string,                    // gerado pelo Auth
  nome: string,                   // obrigatório
  email: string,                  // único, obrigatório
  password: string,               // hash bcrypt, obrigatório
  role: enum["admin"|"produtor"|"consumidor"],  // obrigatório
  filiacao: string,               // opcional
  nivel_acesso: number (1-10),    // para uso futuro
  data_registo: Date,             // automático
  ultimo_acesso: Date,            // atualizado em login
  ativo: boolean                  // soft-delete
}
```

### Dados Guardados

**Em MongoDB (Auth):**

- ID único (string).
- Nome, email, role, filiação.
- Password com hash bcrypt (nunca em texto plano).
- Data de registo, último acesso.
- Flag `ativo` (soft-delete).

**Nunca é devolvido:**

- Password (removida em `toJSON()`).

### Acesso Baseado em Role

| Operação             | Admin | Produtor | Consumidor |
| ---------------------- | ----- | -------- | ---------- |
| Ler públicos          | ✓    | ✓       | ✓         |
| Ler privados próprios | ✓    | ✓       | —         |
| Criar recursos         | ✓    | ✓       | —         |
| Editar próprios       | ✓    | ✓       | —         |
| Editar alheios         | ✓    | —       | —         |
| Apagar                 | ✓    | ✓*      | —         |
| Comentar               | ✓    | ✓       | —         |
| Votar                  | ✓    | ✓       | ✓         |
| Gerir utilizadores     | ✓    | —       | —         |
| Export/import          | ✓    | —       | —         |

*Produtor pode apagar apenas os seus.

**Código:**

- [services/auth/models/User.js](../services/auth/models/User.js)
- [services/api/middleware/auth.js](../services/api/middleware/auth.js): verificação de permissões

---

## 9) Recursos (Modelo e Persistência)

### Modelo em MongoDB

```javascript
{
  _id: ObjectId,
  metadata: Object,                // metadados internos no formato { resource: {...} }
  aipPath: string,                 // caminho em disco: data/aip/<resourceId>
  aipFile: {
    originalName: string,          // nome do ZIP original
    storageName: string,           // nome guardado em disco
    path: string,                  // caminho completo
    mimeType: string,              // application/zip
    size: number                   // tamanho em bytes
  },
  produtor: string,                // ID do utilizador que submeteu
  downloadCount: number,           // contador para top3
  createdAt: Date,
  updatedAt: Date (opcional)       // apenas em PATCH
}
```
## Contrato de metadados:

    tipo          string  obrigatório   1–80 caracteres
    titulo        string  obrigatório   1–200 caracteres
    visibilidade  enum    obrigatório   'publico' | 'privado'
    subtitulo     string  opcional      máx 200 caracteres
    descricao     string  opcional      máx 2000 caracteres
    tema          string  opcional      máx 120 caracteres
    ano           inteiro opcional      0–3000
    dataCriacao   string  opcional      formato YYYY, YYYY-MM ou YYYY-MM-DD
    hashtags      array   opcional      máx 20 entradas, cada uma máx 80 caracteres,
                                        sem espaços, sem entradas vazias

### Persistência

**Metadados:**

- Guardados em MongoDB (`resources` collection).
- Pesquisável por filtros (ano, tipo, etc.).
- Rápido para queries.

**Conteúdo (ficheiros):**

- Guardado em disco em `data/aip/<resourceId>/`.
- Estrutura BagIt simplificada.
- Permite backup independente do DB.

### Validações na Criação (Ingest)

| Campo                         | Validação                      | Erro                  |
| ----------------------------- | -------------------------------- | --------------------- |
| **tipo**                | Obrigatório                     | BAD_METADATA          |
| **titulo**              | Obrigatório                     | BAD_METADATA          |
| **visibilidade**        | `publico` ou `privado`       | BAD_METADATA          |
| **ano** (opcional)      | Número válido                  | —                    |
| **tema** (opcional)     | String                           | —                    |
| **hashtags** (opcional) | Array de strings                 | —                    |
| **Checksums**           | Devem corresponder aos ficheiros | CHECKSUM_MISMATCH     |
| **Estrutura ZIP**       | BagIt simplificada               | INVALID_BAG_STRUCTURE |

### Decisões de Design

1. **Metadados em DB:** permite queries rápidas e filtros.
2. **Ficheiros em disco:** scalable, durável, separado do DB.
3. **Soft-delete opcional:** pode implementar-se com `ativo: false` sem apagar dados.

**Código:**

- [services/api/models/Resource.js](../services/api/models/Resource.js)
- [services/api/oais/ingest/sip.js](../services/api/oais/ingest/sip.js): validações

---

## 10) Notícias

### Modelo

```javascript
{
  _id: ObjectId,
  titulo: string,                 // max 160 chars
  conteudo: string,               // max 10000 chars
  tipo: enum["manual"|"system"],  // manual = admin, system = automática
  eventType: string,              // ex: "system.new_submission"
  dedupeKey: string,              // único, para evitar duplicados
  payload: Object,                // dados estruturados
  publicadoEm: Date,
  createdBy: string               // ID do criador ou "system"
}
```

### Tipos de Notícias

#### Manual

- Criadas pelo admin via POST `/api/news`.
- Exemplo: "Plataforma em manutenção".

#### System (Automáticas)

- `system.new_submission`: quando um novo recurso é submetido.
- `system.top3`: top 3 recursos mais descarregados (atualizado diariamente).
- `system.total_users`: total de utilizadores registados (atualizado diariamente).

### Estratégia de Deduplicação

**Campo `dedupeKey`:** único, evita duplicados.

Exemplos:

```
"system.new_submission:resourceId-123" → notícia upsertada por resourceId
"system.top3:day-2026-04-28"           → notícia diária
"system.total_users:day-2026-04-28"    → notícia diária
```

**Por que é importante:**

- Jobs diários não criam duplicados.
- Reutiliza a mesma notícia ao atualizar dados.
- Reduz "ruído" na home.

### Home da Interface

Mostra as últimas 5 notícias (ordenadas por `publicadoEm` descendente).

**Código:**

- [services/api/models/NewsItem.js](../services/api/models/NewsItem.js)
- [services/api/lib/newsPublisher.js](../services/api/lib/newsPublisher.js): publicação
- [services/api/lib/systemNewsJob.js](../services/api/lib/systemNewsJob.js): jobs automáticas
- [services/api/routes/news.js](../services/api/routes/news.js): CRUD manual

---

## 11) Tratamento do Dataset

### Estado Inicial

A plataforma começa com dataset vazio. Dados são preenchidos via:

1. **Upload manual de SIPs** (interface ou API).
2. **Import de dump** (POST `/api/import` com dados já estruturados).
3. **Seed automático** (futura: script que carrega dataset padrão).

### Dataset Mínimo para Demonstração

Para uma apresentação funcional, recomenda-se:

- **5-10 recursos** em tipos variados (livro, documento, imagem).
- **2-3 utilizadores** em roles diferentes (admin, produtor, consumidor).
- **3-5 posts** com comentários associados.
- **Alguns ratings** para mostrar o ranking.

### Como Carregar Dataset

**Opção 1: Upload manual**

```bash
# Criar um SIP em ZIP (com manifest.json, data/, bagit.txt e checksums.txt)
# POST /api/oais/ingest -F "sip=@recurso.zip"
```

**Opção 2: Import de dump**

```bash
# Gerar dump da plataforma
# GET /api/export → guardar em dump.json

# Importar noutro ambiente
# POST /api/import -F "dumpFile=@dump.json"
```

**Opção 3: Script de seed (futura)**

```bash
# Carregar automaticamente recursos pré-compilados
```

### Estrutura de SIP Exemplo

```
exemplo.zip
├── manifest.json
│   {
│     "titulo": "Uma História de Portugal",
│     "tipo": "artigo",
│     "visibilidade": "publico",
│     "ano": 2022,
│     "tema": "história",
│     "hashtags": ["história", "portugal"],
│     "files": [
│       { "name": "livro.pdf", "size": 2048000, "type": "application/pdf", "required": true },
│       { "name": "capa.jpg", "size": 204800, "type": "image/jpeg", "required": false }
│     ]
│   }
├── bagit.txt
│   Text-Encoding: UTF-8
│   BagIt-Version: 1.0
├── checksums.txt
│   abc123... data/livro.pdf
│   def456... data/capa.jpg
└── data/
    ├── livro.pdf
    └── capa.jpg
```

### Considerações para Produção

1. **Backup regularmente:** export total via `/api/export`.
2. **Validar checksums:** sempre antes de importar SIPs.
3. **Monitorar disco:** `data/aip/` pode crescer muito.
4. **Limpar temporários:** `tmp/` durante ingest.

---

## Conclusão

Esta arquitetura implementa todos os requisitos do enunciado com foco em:

- **OAIS:** separação clara entre SIP/AIP/DIP e metadados.
- **Segurança:** autenticação JWT, autorização por role, validação de entrada.
- **Escalabilidade:** metadados em DB, ficheiros em disco.
- **Flexibilidade:** taxonomy em JSON, fácil de estender.
- **Recuperação:** export/import para backup e migração.

As decisões de design priorizaram **simplicidade** e **conformidade** ao enunciado, deixando espaço para otimizações futuras.
