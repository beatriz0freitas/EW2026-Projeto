# EW2026 - Plataforma de disponibilização e gestão de recursos

## 1. Introdução

Este documento descreve a solução implementada para a Proposta 1 do projeto inserido na unidade curricular de Engenharia Web 2026: uma plataforma de gestão, preservação, disponibilização e discussão de recursos educativos. O projeto foi pensado para responder à preservação arquivística dos recursos e à experiência quotidiana de uso da plataforma por produtores, consumidores e administradores.

Ao longo da implementação, a preocupação central foi evitar que a aplicação se transformasse num mero “site de upload de ficheiros”. O recurso precisava de entrar no sistema com validação, rastreabilidade e estrutura, ficar preservado de forma coerente, e só depois ser disponibilizado para consulta, download, discussão e reutilização. É por isso que o modelo OAIS foi assumido como referência funcional e não apenas como terminologia decorativa.

Em paralelo, a plataforma tinha de ser demonstrável, navegável e utilizável de ponta a ponta. Isso implicou construir uma interface web server-side, implementar autenticação e autorização por perfis, permitir pesquisa e exploração do catálogo, criar publicações e comentários sobre os recursos, disponibilizar rankings e notícias e suportar exportação/importação de dados para backup, migração e demonstração.

## 2. Arquitetura Geral

### 2.1 Separação por serviços

A decisão de separar `auth`, `api`, `interface` e `gateway` foi tomada para que cada parte tivesse uma fronteira funcional clara. Com esta separação, tornou-se mais simples explicar e validar o comportamento do sistema:

- a identidade vive no `auth`;
- o domínio e as regras críticas vivem na `api`;
- a interface apenas representa essas regras e melhora a experiência do utilizador;
- o `gateway` define o que é público e o que é apenas interno.

### 2.2 `nginx` e `gateway`

Foi mantido um `nginx` externo e um `gateway` lógico interno porque estes dois papéis, embora próximos, não são iguais. O `nginx` faz a função de bordo técnico simples e o `gateway` concentra regras de encaminhamento, Swagger agregado, rate limiting global e bloqueio explícito de rotas que existem para consumo interno dos serviços.

Na prática, o `gateway` bloqueia endpoints como:

- `/api/news/system`
- `/api/internal/audit`
- `/auth/sessions/verify`
- `/auth/sessions/refresh-server`

Estes endpoints continuam a existir dentro da rede Docker e são chamados com `INTERNAL_SERVICE_TOKEN`, mas não integram a superfície pública da plataforma.

### 2.3 MongoDB + disco

Foi escolhida uma estratégia híbrida: documentos no MongoDB e conteúdo preservado em disco. O domínio da aplicação contém objetos ricos e flexíveis (`Resource`, `Aip`, `NewsItem`, `AuditLog`, `Post`, `Comment`, `Rating`) que encaixam bem em documentos MongoDB. Já os AIPs são pacotes estruturados, potencialmente maiores e com valor arquivístico próprio. Desta forma, guardá-los em disco permite preservar a organização do pacote sem o dissolver em campos da base de dados.

Esta separação também torna mais clara a distinção entre **metadados e estado lógico**, pesquisáveis e administráveis no MongoDB e o **conteúdo arquivístico**, preservado como pacote em `data/aip/<resourceId>/`.

## 3. Modelo de Domínio e Regras Centrais

### 3.1 Perfis de acesso

Foram implementados três perfis alinhados com o enunciado:

- **`admin`** — acesso total a dados, gestão de utilizadores, notícias, auditoria e importação/exportação global;
- **`produtor`** — criação de recursos, gestão dos próprios recursos e acesso às operações sociais e de transferência permitidas;
- **`consumidor`** — leitura de recursos acessíveis, download de DIPs, posts, comentários e avaliações.

### 3.2 Visibilidade como regra transversal

A visibilidade do recurso é uma das regras mais importantes do sistema. Um recurso `publico` pode ser consultado em cenários de leitura pública/normal. Um recurso `privado` só é acessível ao seu produtor ou a um administrador. Esta regra é reaplicada em múltiplos contextos nomeadamente nas listagem e detalhe de recursos, download de DIP, leitura de posts associados, comentários, ratings, exportação/importação e dumps filtrados.

Esta opção evita que conteúdos sociais ou dados derivados exponham indiretamente um recurso privado.

## 4. Fluxo OAIS

O OAIS foi incorporado na lógica de entrada e saída do recurso. A submissão é um pacote, o pacote é validado, o pacote validado é preservado, e a disseminação é gerada a partir desse arquivo preservado.

Foi implementado um fluxo de submissão dupla, mas convergente:

1. **Submissão simples** — o utilizador preenche metadados e anexa ficheiros; a API constrói automaticamente o SIP BagIt simplificado.
2. **Submissão avançada** — o utilizador envia um SIP ZIP já preparado.

Apesar da diferença na origem, ambos os modos convergem para a mesma cadeia OAIS:

```text
submissão -> SIP -> validação por camadas -> AIP preservado -> DIP gerado do AIP
```

### 4.1 Estrutura e validação do SIP

O SIP segue uma estrutura BagIt simplificada:

```text
recurso.zip
├── manifest.json
├── bagit.txt
├── checksums.txt
└── data/
    └── ficheiros do recurso
```

O processo de ingest valida quatro camadas:

- **estrutura** — ZIP válido, manifesto, pasta `data/`, existência dos ficheiros declarados;
- **metadados** — campos obrigatórios, tipos, datas, listas, limites e normalização;
- **segurança** — zip-slip, caminhos perigosos, extensões não suportadas, limites de tamanho;
- **consistência** — checksums, tamanhos declarados, correspondência manifesto/ficheiros.

Se houver erro, o sistema devolve um relatório estruturado e regista o contexto da falha. Se houver sucesso, cria `Resource`, cria `Aip`, guarda `bag/` e preserva `sip.zip`.

### 4.2 Diferenças DIP e SIP

Uma das decisões mais importantes do projeto foi garantir que o download nunca fosse simplesmente “o que entrou”. O utilizador descarrega um DIP gerado a partir do que foi preservado. Isso implica que o sistema devolve um produto coerente com o arquivo preservado e a estrutura técnica de preservação (`bag/`, `sip.zip`, elementos internos) não precisa de ser exposta ao consumidor.

O DIP inclui `metadados.json` e os ficheiros de consumo, podendo também ser gerado de forma seletiva por ficheiro.

## 5. Metadados, Validação e Classificação

### 5.1 Centralização da validação

Os metadados dos recursos são validados em `services/api/lib/metadataValidator.js`. A centralização desta lógica foi deliberada. Durante o desenvolvimento tornou-se evidente que submissão simples, ingest de SIP e edição de recurso não podiam evoluir com regras ligeiramente diferentes. Isso criaria inconsistências difíceis de detetar e ainda mais difíceis de explicar numa demonstração.

### 5.2 Tipos de recurso extensíveis

Para tornar a classificação dos recursos mais flexível, o campo `tipo` passou a seguir um modelo extensível. O backend aceita qualquer valor textual válido, aplica normalização e garante consistência no armazenamento dos metadados.

O conjunto base de tipos mantém-se como referência prática na interface e nos scripts de povoamento, funcionando como sugestão inicial e não como limite fechado. Desta forma, o catálogo pode crescer de forma natural sem exigir alterações de código sempre que surge uma nova categoria.

## 6. Autenticação, Renovação de Sessão e Perfis

### 6.1 Serviço `auth`

O `auth` suporta:

- registo local;
- login por email ou username;
- emissão de access token JWT;
- refresh token;
- verificação de token;
- OAuth Google/Facebook quando configurado;
- gestão administrativa de utilizadores.

As passwords são armazenadas com bcrypt e removidas das respostas JSON.

### 6.2 Refresh token e UX server-side

O fluxo de autenticação foi desenhado para funcionar bem com uma interface server-side. O access token tem duração curta; o refresh token tem duração superior e fica em cookie HttpOnly. Quando a interface encontra um `401` vindo da API, chama internamente `/auth/sessions/refresh-server`, obtém um novo access token e repete o pedido original.

Este fluxo foi escolhido porque evita obrigar o utilizador a novo login sempre que o access token expira, sem mover a lógica crítica para o browser.

### 6.3 Sessão persistente da interface

A interface usa uma store de sessão persistente em MongoDB através de `connect-mongo`, mantendo o estado da camada web alinhado com a estratégia de persistência já usada no resto da plataforma.

Com esta solução, as sessões deixam de depender exclusivamente do processo da interface e ganham maior estabilidade operacional, ao mesmo tempo que a gestão de estado fica mais consistente com a arquitetura global da aplicação.

## 7. Camada Social: Posts, Comentários, Ratings e Notícias

A solução incorporou uma camada social composta por posts, comentários e ratings.

### 7.1 Posts e comentários

Os posts são associados a um `resourceId` e funcionam como ponto de discussão contextual. Um utilizador autenticado pode criar publicações sobre recursos a que tenha acesso; a leitura dessas publicações continua a respeitar a visibilidade do recurso associado.

Os comentários existem como resposta a posts e também seguem a mesma regra de acesso indireto: não se comenta nem se consulta uma discussão de um recurso privado sem ter acesso ao recurso.

### 7.2 Ratings

As classificações foram implementadas como upsert por par `(resourceId, userId)`. Esta decisão simplifica muito o modelo: cada utilizador mantém apenas uma classificação por recurso, o sistema calcula média e total, e a interface pode mostrar tanto o ranking agregado como a classificação individual do utilizador autenticado.

### 7.3 Notícias manuais e de sistema

As notícias aparecem em duas formas: **manuais**, publicadas por administradores e **automáticas**, geradas por eventos do sistema.

As notícias automáticas mais importantes são:

- nova submissão pública (`system.new_submission`);
- top 3 de recursos mais requisitados (`system.top3`);
- alteração do total de utilizadores (`system.total_users`).

Para evitar ruído, foi introduzido o uso de `dedupeKey`, especialmente nas notícias de sistema. Assim, uma atualização do top 3 só republica notícia quando o ranking muda realmente.

## 8. Exportação e Importação de Dados

O dump usa `version: "2"` e pode incluir recursos, AIPs, ficheiros AIP em base64, notícias, posts, comentários, ratings e utilizadores. Como os utilizadores vivem no serviço `auth`, a API coordena esta parte através de endpoints internos protegidos por token interno.

O raciocínio principal aqui foi que a transferência de dados tinha de continuar sujeita a permissões. Não faria sentido permitir a um consumidor exportar tudo ou a um produtor importar conteúdo alheio sem restrição. Por isso, o sistema aplica filtros e regras diferentes conforme o perfil.

## 9. Segurança e Observabilidade

### 9.1 Segurança por camadas

A segurança foi tratada em múltiplos níveis:

- `helmet` nos serviços web;
- CORS explícito;
- rate limiting no `gateway`, na `api` e no login do `auth`;
- validação de payloads;
- limites de upload e de pacote;
- whitelist de extensões permitidas;
- proteção contra zip-slip;
- `INTERNAL_SERVICE_TOKEN` para endpoints internos;
- revalidação backend de permissões mesmo quando a interface esconde ações.

### 9.2 Histórico e rastreabilidade

Foi criada uma camada de auditoria persistente em MongoDB. O objetivo não era apenas guardar logs HTTP, mas também conseguir responder a perguntas do tipo:

- quem executou esta ação;
- sobre que alvo;
- com que resultado;
- em que serviço;
- com que contexto sanitizado.

Além disso, `requestId` e health checks foram incluídos para melhorar rastreabilidade entre serviços.

## 10. Interface Web

A interface foi construída com Express e Pug e funciona como uma camada web server-side sobre os serviços `api` e `auth`. Esta escolha tornou a aplicação mais direta para os objetivos do projeto, porque evita duplicar no browser regras que já existem no backend.

A página inicial apresenta recursos recentes, notícias e estatísticas. A área de autenticação permite login, registo, logout e OAuth opcional. A área de recursos permite listar, pesquisar, consultar detalhes, criar recursos por submissão simples, enviar SIP avançado, editar metadados quando permitido e descarregar DIPs. Nos detalhes de cada recurso, o utilizador pode aceder à discussão associada, comentar e classificar.

Existe também uma área de dados para exportação e importação conforme o perfil do utilizador. Para administradores, a interface inclui páginas de gestão de utilizadores, notícias, auditoria e transferência global de dados. Estas páginas não substituem a segurança do backend; apenas tornam visíveis as ações disponíveis para cada perfil.

A interface foi desenhada para acompanhar o funcionamento real da API. Por exemplo, os filtros de exportação apresentados no formulário seguem as mesmas definições de normalização e resumo usadas no backend. Isto reduz a possibilidade de discrepâncias entre o que a interface promete e o que a API executa.

## 11. Povoamento, Dataset de Demonstração e Ajustes de Campo

### 11.1 Estado inicial e necessidade de escala

No arranque, a plataforma tinha apenas o seed mínimo de utilizadores e recursos limitados. Isso permitia validar o núcleo funcional, mas era insuficiente para mostrar bem filtros, rankings, feed social, notícias e diversidade de catálogo.

### 11.2 Seed de utilizadores e recursos reais

Foram mantidos os seeds base:

- `data/povoamento/fixtures.json`
- `data/povoamento/init-mongo.js`
- `data/povoamento/povoamento-recursos.py`

O script `povoamento-recursos.py` foi pensado para ingerir materiais reais a partir de `data/recursos`, usando a API pública de ingestão simples. Durante a utilização prática do script surgiram dois problemas reais:

1. algumas pastas continham ficheiros não permitidos pelo backend (`.o`, `.out`, `.sh`), o que fazia falhar o recurso inteiro;
2. a lógica inicial de deduplicação era demasiado agressiva e podia bloquear uma pasta só porque um subconjunto dos nomes de ficheiro já existia noutro recurso.

Esses dois pontos foram corrigidos ao longo da implementação:

- o script passou a **ignorar automaticamente ficheiros com extensões não suportadas**;
- a deteção de duplicados passou a ser menos agressiva, considerando o conjunto completo dos ficheiros e o título do recurso.

### 11.3 Povoamento em larga escala

Para enriquecer a plataforma não apenas com recursos, mas também com sinais de utilização, foi criado `data/povoamento/povoar-amostra-grande.js`. Este seed atua diretamente sobre a base MongoDB e faz o seguinte:

- cria utilizadores de demonstração adicionais;
- enriquece recursos existentes com `tema`, `ano`, `descricao`, `subtitulo`, `hashtags`, visibilidade e `downloadCount`;
- cria dezenas de posts, comentários e ratings;
- garante notícias manuais relevantes para a homepage e área administrativa.

Na instância local validada durante a implementação, a combinação do seed social com o carregamento de recursos reais levou o catálogo a **70 recursos**, com dezenas de publicações, centenas de comentários e ratings suficientes para alimentar ranking e feed de demonstração.

## 12. Testes e Validação

O foco principal da bateria de testes ficou na API, por ser a componente com maior densidade de regras críticas. A suite usa `node:test` e cobre, entre outras áreas:

- validação de metadados;
- regras de visibilidade;
- autorização e permissões;
- middlewares de validação;
- uploads e limites;
- criação automática de SIP;
- armazenamento AIP;
- geração de DIP;
- ingest OAIS;
- filtros e permissões de transferência de dados;
- rate limiting.

## 13. Conclusão

O resultado final é uma plataforma que cumpre o enunciado não apenas em termos de funcionalidades visíveis, mas também ao nível do raciocínio estrutural que lhes dá suporte. O sistema preserva recursos segundo o modelo OAIS, impõe regras de autenticação e autorização coerentes, disponibiliza uma interface navegável e completa, suporta interação social e administração, exporta/importa dados e pode ser povoado com recursos reais para demonstração.

Ao longo da implementação houve também uma evolução importante do próprio desenho: tipos de recurso deixaram de estar presos a enumeração, a sessão da interface passou a persistente, o dataset de demonstração foi enriquecido e os scripts de povoamento foram ajustados ao comportamento real da API. Esses ajustes não são desvios ao projeto; são precisamente o reflexo de um processo de implementação guiado por validação contínua contra o enunciado e contra o comportamento observado da aplicação.

Em suma, a plataforma não ficou apenas “funcional”. Ficou coerente com o problema que pretendia resolver: receber, validar, preservar, disponibilizar e contextualizar recursos educativos numa aplicação onde o arquivo e a utilização convivem no mesmo fluxo.
