# EW2026 - Plataforma de disponibilização e gestão de recursos

## 1. Enquadramento

Este documento descreve a solução implementada para a Proposta 1 do projeto inserido na unidade curricular de Engenharia Web 2026: uma plataforma de gestão, preservação, disponibilização e discussão de recursos educativos. O projeto foi pensado para responder à preservação arquivística dos recursos e à experiência quotidiana de uso da plataforma por produtores, consumidores e administradores.

Ao longo da implementação, a preocupação central foi evitar que a aplicação se transformasse num mero “site de upload de ficheiros”. O recurso precisava de entrar no sistema com validação, rastreabilidade e estrutura, ficar preservado de forma coerente, e só depois ser disponibilizado para consulta, download, discussão e reutilização. É por isso que o modelo OAIS foi assumido como referência funcional e não apenas como terminologia decorativa.

Em paralelo, a plataforma tinha de ser demonstrável, navegável e utilizável de ponta a ponta. Isso implicou construir uma interface web server-side, implementar autenticação e autorização por perfis, permitir pesquisa e exploração do catálogo, criar publicações e comentários sobre os recursos, disponibilizar rankings e notícias e suportar exportação/importação de dados para backup, migração e demonstração.

## 4. Raciocínio Arquitetural

### 4.1 Separação por serviços

A decisão de separar `auth`, `api`, `interface` e `gateway` foi tomada para que cada parte tivesse uma fronteira funcional clara. Com esta separação, tornou-se mais simples explicar e validar o comportamento do sistema:

- a identidade vive no `auth`;
- o domínio e as regras críticas vivem na `api`;
- a interface apenas representa essas regras e melhora a experiência do utilizador;
- o `gateway` define o que é público e o que é apenas interno.

### 4.2 `nginx` e `gateway`

Foi mantido um `nginx` externo e um `gateway` lógico interno porque estes dois papéis, embora próximos, não são iguais. O `nginx` faz a função de bordo técnico simples e o `gateway` concentra regras de encaminhamento, Swagger agregado, rate limiting global e bloqueio explícito de rotas que existem para consumo interno dos serviços.

Na prática, o `gateway` bloqueia endpoints como:

- `/api/news/system`
- `/api/internal/audit`
- `/auth/sessions/verify`
- `/auth/sessions/refresh-server`

Estes endpoints continuam a existir dentro da rede Docker e são chamados com `INTERNAL_SERVICE_TOKEN`, mas não integram a superfície pública da plataforma.

### 4.3 MongoDB + disco

Foi escolhida uma estratégia híbrida: documentos no MongoDB e conteúdo preservado em disco. O domínio da aplicação contém objetos ricos e flexíveis (`Resource`, `Aip`, `NewsItem`, `AuditLog`, `Post`, `Comment`, `Rating`) que encaixam bem em documentos MongoDB. Já os AIPs são pacotes estruturados, potencialmente maiores e com valor arquivístico próprio. Desta forma, guardá-los em disco permite preservar a organização do pacote sem o dissolver em campos da base de dados.

Esta separação também torna mais clara a distinção entre **metadados e estado lógico**, pesquisáveis e administráveis no MongoDB e o **conteúdo arquivístico**, preservado como pacote em `data/aip/<resourceId>/`.

## 5. Modelo de Domínio e Regras Centrais

### 5.2 Perfis de acesso

Foram implementados três perfis alinhados com o enunciado:

- **`admin`** — acesso total a dados, gestão de utilizadores, notícias, auditoria e importação/exportação global;
- **`produtor`** — criação de recursos, gestão dos próprios recursos e acesso às operações sociais e de transferência permitidas;
- **`consumidor`** — leitura de recursos acessíveis, download de DIPs, posts, comentários e avaliações.

### 5.3 Visibilidade como regra transversal

A visibilidade do recurso é uma das regras mais importantes do sistema. Um recurso `publico` pode ser consultado em cenários de leitura pública/normal. Um recurso `privado` só é acessível ao seu produtor ou a um administrador. Esta regra é reaplicada em múltiplos contextos nomeadamente nas listagem e detalhe de recursos, download de DIP, leitura de posts associados, comentários, ratings, exportação/importação e dumps filtrados.

Esta opção evita que conteúdos sociais ou dados derivados exponham indiretamente um recurso privado.

## 6. OAIS como Fluxo Real de Aplicação

O OAIS foi incorporado na lógica de entrada e saída do recurso. A submissão é um pacote, o pacote é validado, o pacote validado é preservado, e a disseminação é gerada a partir desse arquivo preservado.

Foi implementado um fluxo de submissão dupla, mas convergente:

1. **Submissão simples** — o utilizador preenche metadados e anexa ficheiros; a API constrói automaticamente o SIP BagIt simplificado.
2. **Submissão avançada** — o utilizador envia um SIP ZIP já preparado.

Apesar da diferença na origem, ambos os modos convergem para a mesma cadeia OAIS:

```text
submissão -> SIP -> validação por camadas -> AIP preservado -> DIP gerado do AIP
```

### 6.3 Estrutura e validação do SIP

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

### 6.4 Diferenças DIP e SIP

Uma das decisões mais importantes do projeto foi garantir que o download nunca fosse simplesmente “o que entrou”. O utilizador descarrega um DIP gerado a partir do que foi preservado. Isso implica que o sistema devolve um produto coerente com o arquivo preservado e a estrutura técnica de preservação (`bag/`, `sip.zip`, elementos internos) não precisa de ser exposta ao consumidor.

O DIP inclui `metadados.json` e os ficheiros de consumo, podendo também ser gerado de forma seletiva por ficheiro.

## 7. Metadados, Validação e Classificação

### 7.1 Centralização da validação

Os metadados dos recursos são validados em `services/api/lib/metadataValidator.js`. A centralização desta lógica foi deliberada. Durante o desenvolvimento tornou-se evidente que submissão simples, ingest de SIP e edição de recurso não podiam evoluir com regras ligeiramente diferentes. Isso criaria inconsistências difíceis de detetar e ainda mais difíceis de explicar numa demonstração.

### 7.2 Tipos de recurso extensíveis

Para tornar a classificação dos recursos mais flexível, o campo `tipo` passou a seguir um modelo extensível. O backend aceita qualquer valor textual válido, aplica normalização e garante consistência no armazenamento dos metadados.

O conjunto base de tipos mantém-se como referência prática na interface e nos scripts de povoamento, funcionando como sugestão inicial e não como limite fechado. Desta forma, o catálogo pode crescer de forma natural sem exigir alterações de código sempre que surge uma nova categoria.

## 8. Autenticação, Renovação de Sessão e Perfis

### 8.1 Serviço `auth`

O `auth` suporta:

- registo local;
- login por email ou username;
- emissão de access token JWT;
- refresh token;
- verificação de token;
- OAuth Google/Facebook quando configurado;
- gestão administrativa de utilizadores.

As passwords são armazenadas com bcrypt e removidas das respostas JSON.

### 8.2 Refresh token e UX server-side

O fluxo de autenticação foi desenhado para funcionar bem com uma interface server-side. O access token tem duração curta; o refresh token tem duração superior e fica em cookie HttpOnly. Quando a interface encontra um `401` vindo da API, chama internamente `/auth/sessions/refresh-server`, obtém um novo access token e repete o pedido original.

Este fluxo foi escolhido porque evita obrigar o utilizador a novo login sempre que o access token expira, sem mover a lógica crítica para o browser.

### 8.3 Sessão persistente da interface

A interface usa uma store de sessão persistente em MongoDB através de `connect-mongo`, mantendo o estado da camada web alinhado com a estratégia de persistência já usada no resto da plataforma.

Com esta solução, as sessões deixam de depender exclusivamente do processo da interface e ganham maior estabilidade operacional, ao mesmo tempo que a gestão de estado fica mais consistente com a arquitetura global da aplicação.

## 9. Camada Social: Posts, Comentários, Ratings e Notícias

A solução incorporou uma camada social composta por posts, comentários e ratings.

### 9.2 Posts e comentários

Os posts são associados a um `resourceId` e funcionam como ponto de discussão contextual. Um utilizador autenticado pode criar publicações sobre recursos a que tenha acesso; a leitura dessas publicações continua a respeitar a visibilidade do recurso associado.

Os comentários existem como resposta a posts e também seguem a mesma regra de acesso indireto: não se comenta nem se consulta uma discussão de um recurso privado sem ter acesso ao recurso.

### 9.3 Ratings

As classificações foram implementadas como upsert por par `(resourceId, userId)`. Esta decisão simplifica muito o modelo: cada utilizador mantém apenas uma classificação por recurso, o sistema calcula média e total, e a interface pode mostrar tanto o ranking agregado como a classificação individual do utilizador autenticado.

### 9.4 Notícias manuais e de sistema

As notícias aparecem em duas formas: **manuais**, publicadas por administradores e **automáticas**, geradas por eventos do sistema.

As notícias automáticas mais importantes são:

- nova submissão pública (`system.new_submission`);
- top 3 de recursos mais requisitados (`system.top3`);
- alteração do total de utilizadores (`system.total_users`).

Para evitar ruído, foi introduzido o uso de `dedupeKey`, especialmente nas notícias de sistema. Assim, uma atualização do top 3 só republica notícia quando o ranking muda realmente.

## 10. Exportação e Importação de Dados

O dump usa `version: "2"` e pode incluir recursos, AIPs, ficheiros AIP em base64, notícias, posts, comentários, ratings e utilizadores. Como os utilizadores vivem no serviço `auth`, a API coordena esta parte através de endpoints internos protegidos por token interno.

O raciocínio principal aqui foi que a transferência de dados tinha de continuar sujeita a permissões. Não faria sentido permitir a um consumidor exportar tudo ou a um produtor importar conteúdo alheio sem restrição. Por isso, o sistema aplica filtros e regras diferentes conforme o perfil.

## 11. Segurança e Observabilidade

### 11.1 Segurança por camadas

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

### 11.2 Histórico e rastreabilidade

Foi criada uma camada de auditoria persistente em MongoDB. O objetivo não era apenas guardar logs HTTP, mas também conseguir responder a perguntas do tipo:

- quem executou esta ação;
- sobre que alvo;
- com que resultado;
- em que serviço;
- com que contexto sanitizado.

Além disso, `requestId` e health checks foram incluídos para melhorar rastreabilidade entre serviços.

## 13. Povoamento, Dataset de Demonstração e Ajustes de Campo

### 13.1 Estado inicial e necessidade de escala

No arranque, a plataforma tinha apenas o seed mínimo de utilizadores e recursos limitados. Isso permitia validar o núcleo funcional, mas era insuficiente para mostrar bem filtros, rankings, feed social, notícias e diversidade de catálogo.

### 13.2 Seed de utilizadores e recursos reais

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

### 13.3 Povoamento em larga escala

Para enriquecer a plataforma não apenas com recursos, mas também com sinais de utilização, foi criado `data/povoamento/povoar-amostra-grande.js`. Este seed atua diretamente sobre a base MongoDB e faz o seguinte:

- cria utilizadores de demonstração adicionais;
- enriquece recursos existentes com `tema`, `ano`, `descricao`, `subtitulo`, `hashtags`, visibilidade e `downloadCount`;
- cria dezenas de posts, comentários e ratings;
- garante notícias manuais relevantes para a homepage e área administrativa.

Na instância local validada durante a implementação, a combinação do seed social com o carregamento de recursos reais levou o catálogo a **70 recursos**, com dezenas de publicações, centenas de comentários e ratings suficientes para alimentar ranking e feed de demonstração.

## 14. Testes e Validação

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

Na última ronda de validação da API usada durante o desenvolvimento, a suite passou com **46 testes bem-sucedidos**. Para além disso, foram usados checks adicionais como:

- `node --check` em ficheiros JavaScript alterados;
- `git diff --check` para validar diffs sem problemas de whitespace;
- validação de Pug/templates e inspeção funcional das páginas principais.

## 15. Limitações Atuais e Trabalho Futuro

Apesar de o projeto cumprir o objetivo funcional, há limitações assumidas:

- os serviços `auth`, `gateway` e `interface` ainda beneficiariam de suites de testes dedicadas;
- o `gateway` ainda pode evoluir com circuit breaker, métricas operacionais mais fortes e estratégias de fallback;
- a gestão administrativa explícita de tipos de recurso continua a ser uma evolução natural, mesmo depois de os tipos terem sido tornados extensíveis;
- o povoamento continua dependente da execução de scripts e não de um cenário totalmente automático no arranque;
- o modelo OAIS implementado é suficiente para o projeto, mas pode ser enriquecido com metadados de preservação mais ricos, como PREMIS ou Dublin Core.

## 16. Conclusão

O resultado final é uma plataforma que cumpre o enunciado não apenas em termos de funcionalidades visíveis, mas também ao nível do raciocínio estrutural que lhes dá suporte. O sistema preserva recursos segundo o modelo OAIS, impõe regras de autenticação e autorização coerentes, disponibiliza uma interface navegável e completa, suporta interação social e administração, exporta/importa dados e pode ser povoado com recursos reais para demonstração.

Ao longo da implementação houve também uma evolução importante do próprio desenho: tipos de recurso deixaram de estar presos a enumeração, a sessão da interface passou a persistente, o dataset de demonstração foi enriquecido e os scripts de povoamento foram ajustados ao comportamento real da API. Esses ajustes não são desvios ao projeto; são precisamente o reflexo de um processo de implementação guiado por validação contínua contra o enunciado e contra o comportamento observado da aplicação.

Em suma, a plataforma não ficou apenas “funcional”. Ficou coerente com o problema que pretendia resolver: receber, validar, preservar, disponibilizar e contextualizar recursos educativos numa aplicação onde o arquivo e a utilização convivem no mesmo fluxo.

O fluxo OAIS foi implementado para garantir que cada recurso passa por uma cadeia controlada desde a submissão até ao download. A plataforma aceita dois tipos de entrada. Na submissão simples, o produtor usa a interface para preencher metadados e anexar ficheiros. A API constrói automaticamente um SIP no formato esperado. Na submissão avançada, o produtor envia diretamente um ZIP SIP já preparado, útil para utilizadores mais técnicos ou processos automatizados.

Independentemente da origem, o resultado é sempre um SIP com estrutura normalizada:

```text
recurso.zip
|-- manifest.json
|-- bagit.txt
|-- checksums.txt
`-- data/
    `-- ficheiros do recurso
```

O `manifest.json` contém os metadados principais do recurso, como título, tipo, visibilidade, tema, ano, descrição, hashtags e lista de ficheiros esperados. Se a visibilidade não for indicada, o sistema assume `publico`. A pasta `data/` contém os ficheiros reais do recurso. O `checksums.txt`, quando presente, permite validar a integridade dos ficheiros através de SHA-256.

Durante o ingest, a API valida o pacote por camadas. A primeira camada verifica a estrutura do ZIP, a existência do manifesto, a pasta `data/` e os ficheiros declarados. A segunda valida os metadados, incluindo campos obrigatórios, enumerações, datas, tamanhos e normalização de hashtags. A terceira camada trata de segurança, rejeitando caminhos perigosos, zip-slip, extensões não permitidas e pacotes acima dos limites definidos. A quarta camada confirma a consistência entre manifesto, ficheiros reais, tamanhos e checksums.

Se o SIP for inválido, é criado um registo de preservação com estado de erro e relatório de validação. Isto permite perceber porque é que uma submissão falhou, em vez de simplesmente rejeitar o pedido sem rastreabilidade. Se o SIP for válido, a API cria o `Resource`, cria o `Aip`, guarda o pacote em disco, preserva uma cópia do ZIP original em `sip.zip` e regista a localização do AIP. A estrutura resultante é organizada por recurso:

```text
data/aip/<resourceId>/
|-- bag/
|   |-- manifest.json
|   |-- bagit.txt
|   |-- checksums.txt
|   `-- data/
|       `-- ficheiros
`-- sip.zip
```

O acesso ao recurso segue o caminho inverso, mas sem expor diretamente o pacote arquivístico. Quando o utilizador pede o download através de `GET /api/oais/access/:id`, a API verifica se o recurso existe, confirma as permissões, lê o AIP preservado e gera um DIP com os ficheiros de consumo e os metadados necessários. Depois do download, os contadores em `Resource` e `Aip` são incrementados e, se a alteração afetar o ranking dos recursos mais requisitados, a notícia automática do top 3 é atualizada.

O DIP é, portanto, um produto de disseminação. Ele é criado para ser útil ao consumidor, não para revelar toda a estrutura de preservação. Por omissão inclui `metadados.json` e os ficheiros do recurso, podendo também ser gerado com uma seleção manual de ficheiros através de parâmetros de query.

## 7. Metadados, Validação e Classificação

A validação de metadados foi centralizada em `lib/metadataValidator.js`. Esta opção evita divergências entre submissão simples, submissão avançada e edição de recursos. O contrato principal é `metadata.resource`, onde se concentram os campos que descrevem o recurso educativo.

O campo `titulo` é obrigatório e limitado em tamanho. O campo `tipo` também é obrigatório e aceita os valores `artigo`, `tese`, `slides`, `teste`, `relatorio`, `aplicacao`, `problema` e `outro`. A `visibilidade` pode ser `publico` ou `privado`, assumindo `publico` por omissão. Campos como `subtitulo`, `descricao` e `tema` são opcionais, mas também têm limites. O `ano` deve ser um inteiro entre 0 e 3000, `dataCriacao` deve ser uma data válida e `hashtags` é normalizado para uma lista controlada.

Esta estrutura permite classificar recursos por tipo, ano, tema, visibilidade e etiquetas. Esses mesmos campos são usados nas listagens, nos filtros de exportação e nas regras de acesso. Desta forma, os metadados não servem apenas para descrever o recurso; eles também orientam a pesquisa, a administração e a transferência de dados.

## 8. Autenticação, Perfis e Sessões

O serviço `auth` permite registo local, login por email ou username, refresh token, OAuth Google/Facebook quando as credenciais estão configuradas e gestão de utilizadores por administradores. As passwords são guardadas com bcrypt e nunca são devolvidas nas respostas da API.

No login são emitidos dois tokens. O access token JWT tem curta duração e é usado para autenticar pedidos aos serviços. O refresh token tem duração superior e é guardado em cookie HttpOnly, reduzindo a exposição a código cliente. A interface mantém uma sessão server-side com os dados necessários para renderizar páginas e fazer pedidos autenticados.

Quando uma chamada da interface à API falha por token expirado, a própria interface chama internamente `/auth/sessions/refresh-server` com o `X-Internal-Token`. Se o refresh for válido, recebe um novo access token e repete o pedido original. Este mecanismo mantém a experiência fluida para o utilizador, ao mesmo tempo que preserva a separação entre sessão web e autenticação entre serviços.

As permissões são aplicadas nos serviços backend. O administrador pode gerir todos os dados. O produtor tem autorização para criar e gerir os seus recursos, mas não pode alterar recursos de outros produtores. O consumidor tem acesso de leitura e interação sobre recursos permitidos. Esta regra é aplicada tanto em operações visíveis na interface como em chamadas diretas à API.

As notícias têm duas origens. As notícias manuais são criadas por administradores e funcionam como comunicação editorial da plataforma. As notícias automáticas são geradas pelo sistema perante eventos relevantes. Atualmente existem notícias para nova submissão pública, atualização do top 3 de recursos mais requisitados e alteração do total de utilizadores.

Para impedir ruído e repetição, as notícias automáticas usam uma chave de deduplicação. No caso do top 3, por exemplo, a notícia só é republicada quando o ranking muda. Assim, o feed mantém-se informativo sem ser preenchido por atualizações redundantes.

## 10. Exportação e Importação de Dados

A exportação e importação foram implementadas como mecanismos de backup, migração e demonstração, mas não ignoram as regras de acesso. O dump exportado usa `version: "2"` e pode incluir recursos, AIPs, ficheiros AIP codificados em base64, notícias, posts, comentários, ratings e utilizadores. Quando a operação envolve utilizadores, a API comunica com o serviço `auth` através de endpoints internos protegidos.

As capacidades variam conforme o perfil. O administrador pode exportar e importar o conjunto global, incluindo utilizadores. O produtor pode exportar recursos permitidos e importar recursos, ficando estes associados ao próprio produtor quando a operação o exige. O consumidor pode exportar recursos públicos e contexto seguro relacionado, mas não pode importar dados.

Os filtros de transferência permitem restringir o conteúdo por tipo, datas, produtor, visibilidade, tipo de notícia, autor de posts ou comentários, estrelas de rating, estado AIP e quantidade. A mesma lógica de normalização existe na API e na interface através dos módulos de filtros, garantindo que aquilo que o utilizador escolhe no formulário corresponde ao comportamento real do backend.

Esta parte do projeto é particularmente importante porque toca várias entidades ao mesmo tempo. Exportar apenas recursos, por exemplo, pode exigir incluir AIPs, posts, comentários ou ratings relacionados, respeitando sempre dependências e permissões. Por isso, a implementação trata as coleções de forma ordenada e aplica filtros tanto em consultas MongoDB como, quando necessário, sobre os dados já carregados.

## 11. Segurança e Observabilidade

A segurança foi tratada em várias camadas. Os serviços usam `helmet`, CORS configurado, limites de tamanho nos pedidos e uploads, rate limiting no gateway, na API e no login, proteção contra zip-slip nos pacotes SIP e validação explícita de permissões no backend. As rotas internas exigem `INTERNAL_SERVICE_TOKEN`, impedindo que operações reservadas à comunicação entre serviços fiquem expostas publicamente.

Os utilizadores removidos são desativados por soft-delete, o que preserva histórico e evita que referências antigas fiquem quebradas. Dados sensíveis, como passwords, tokens e cookies, são removidos antes de serem registados em auditoria. Esta preocupação é importante porque a auditoria deve ajudar a investigar ações sem se transformar num novo ponto de exposição de informação confidencial.

A observabilidade inclui health checks, logs por pedido, propagação de `requestId` e auditoria persistente em MongoDB. O `requestId` é colocado nas respostas e usado nos logs, facilitando o acompanhamento de pedidos entre camadas. A auditoria regista serviço, ação, método, caminho, estado, código HTTP, utilizador, alvo, IP, user-agent e metadados sanitizados.

Esta combinação dá uma visão razoável sobre o comportamento do sistema: é possível saber que operações foram feitas, por quem, sobre que alvo e com que resultado, sem depender apenas de logs temporários dos containers.

## 12. Interface Web

A interface foi construída com Express e Pug e funciona como uma camada web server-side sobre os serviços `api` e `auth`. Esta escolha tornou a aplicação mais direta para os objetivos do projeto, porque evita duplicar no browser regras que já existem no backend.

A página inicial apresenta recursos recentes, notícias e estatísticas. A área de autenticação permite login, registo, logout e OAuth opcional. A área de recursos permite listar, pesquisar, consultar detalhes, criar recursos por submissão simples, enviar SIP avançado, editar metadados quando permitido e descarregar DIPs. Nos detalhes de cada recurso, o utilizador pode aceder à discussão associada, comentar e classificar.

Existe também uma área de dados para exportação e importação conforme o perfil do utilizador. Para administradores, a interface inclui páginas de gestão de utilizadores, notícias, auditoria e transferência global de dados. Estas páginas não substituem a segurança do backend; apenas tornam visíveis as ações disponíveis para cada perfil.

A interface foi desenhada para acompanhar o funcionamento real da API. Por exemplo, os filtros de exportação apresentados no formulário seguem as mesmas definições de normalização e resumo usadas no backend. Isto reduz a possibilidade de discrepâncias entre o que a interface promete e o que a API executa.

## 13. Testes e Dados de Demonstração

A API inclui testes automatizados com `node:test`, cobrindo as áreas de maior risco da aplicação. Existem testes para validação de metadados, regras de acesso, autorização, middlewares de validação e upload, criação de pacotes simples, armazenamento AIP, geração de DIP, ingest OAIS, filtros e permissões de transferência de dados, rate limiting e utilitários de ZIP.

Na validação final referida durante o desenvolvimento, a suíte da API passou com 45 testes bem-sucedidos. A cobertura concentra-se especialmente nos pontos onde uma regressão teria maior impacto: validação de pacotes, permissões, visibilidade, importação/exportação e acesso a recursos.

O projeto inclui ainda dados de demonstração. Em `data/povoamento/fixtures.json` existem três utilizadores iniciais: `admin.teste`, `produtor.teste` e `consumidor.teste`. A pasta `data/recursos` contém ficheiros reais que podem ser carregados para popular a plataforma através do script `data/povoamento/povoamento-recursos.py`. Esta base facilita a demonstração das funcionalidades principais sem exigir criação manual de todos os recursos.

## 14. Limitações e Trabalho Futuro

Apesar de funcional, a solução tem algumas limitações assumidas. A interface já usa `express-session` com store persistente em MongoDB, o que evita perda imediata de sessão em restart do processo web e melhora o comportamento operacional. Como evolução futura, faria sentido adicionar testes dedicados aos fluxos de sessão e tornar a política de retenção ainda mais configurável por perfil ou contexto. Os tipos de recurso já são extensíveis no fluxo principal, mas uma evolução natural seria permitir a sua gestão explícita através de configuração dedicada ou de uma área administrativa.

A API tem testes sobre os componentes principais, mas os serviços `auth`, `gateway` e `interface` ainda beneficiariam de testes próprios. O dataset de demonstração também depende da execução explícita do script de povoamento, pelo que a base de dados inicial não fica completamente carregada apenas com o arranque dos containers. Do ponto de vista operacional, o gateway ainda poderia evoluir com circuit breaker, métricas mais detalhadas e estratégias de fallback para falhas temporárias dos serviços internos.

Como trabalho futuro, faria sentido acrescentar testes end-to-end aos fluxos completos, armazenamento S3-compatível para AIPs, métricas operacionais, gestão administrativa dos tipos de recurso e suporte a metadados de preservação mais ricos, como PREMIS ou Dublin Core. Estes pontos não invalidam a solução atual, mas indicam caminhos claros para a tornar mais robusta e mais próxima de um ambiente de produção.

## 15. Conclusão

A plataforma desenvolvida cumpre o objetivo de gerir e disponibilizar recursos educativos com preservação arquivística, controlo de acessos e funcionalidades de interação. O modelo OAIS foi incorporado no fluxo principal da aplicação: o produtor submete um SIP, o sistema valida e preserva um AIP, e o consumidor recebe um DIP gerado a partir do arquivo.

A arquitetura em serviços separados permitiu organizar melhor as responsabilidades. O `gateway` controla a entrada pública, o `auth` gere identidade e sessões, a `api` concentra o domínio da aplicação e a `interface` oferece uma experiência web utilizável. O MongoDB guarda os documentos e o armazenamento em disco preserva os pacotes AIP.

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

A validação no `auth` existe em várias camadas. O middleware `services/auth/middleware/validate.js` garante que o registo recebe `nome`, `email` e `password`, e que o login recebe `password` mais `email` ou `username`. O modelo `User` reforça `email` único e válido, `role` limitado a `admin`, `produtor` ou `consumidor`, `nivel_acesso` dentro do intervalo permitido e password obrigatória quando o utilizador não vem de OAuth. O `UserService` acrescenta normalização de role, geração segura de `_id`, validação de password mínima, normalização de filiação, rejeição de emails duplicados e bloqueio de contas inativas no login.

---

## 7. Serviço API

O serviço `api` (porta 16025) é o núcleo de domínio. As suas áreas principais são:

### 7.1 Recursos e OAIS

A API implementa o fluxo completo OAIS: ingest (SIP → AIP) e access (AIP → DIP). Disponibiliza também CRUD sobre os metadados dos recursos (listar, consultar, editar, apagar), com controlo de visibilidade em todas as operações. A remoção de um recurso elimina em cascata os documentos AIP, ratings, posts e respetivos comentários, bem como os ficheiros em disco.

### 7.2 Posts, Comentários e Ratings

A camada social permite a utilizadores autenticados criar posts associados a recursos, comentar esses posts e avaliar recursos com estrelas (1–5). As operações respeitam a visibilidade do recurso associado — não é possível consultar, comentar ou avaliar um recurso privado a que o utilizador não tenha acesso.

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

A API disponibiliza endpoints de transferência de dados em `GET /api/export` e `POST /api/import`, com permissões ajustadas ao perfil. Administradores podem exportar e importar o conjunto global, incluindo utilizadores. Produtores podem exportar recursos visíveis/geríveis e conteúdo relacionado, e importar recursos, ficando impedidos de substituir recursos pertencentes a outro produtor. Consumidores podem exportar dados visíveis, sobretudo recursos públicos e conteúdo relacionado seguro, mas não podem importar.

O dump exportado inclui, conforme o perfil e os filtros permitidos, recursos (com ficheiros AIP em base64), AIPs, notícias, posts, ratings, comentários e utilizadores. A importação usa upsert por `_id`, sendo idempotente, valida `version: "2"` e devolve contadores e erros por coleção.

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
- Área de dados (`/data`) para exportação por todos os perfis autenticados e importação por produtores/admins conforme as permissões.
- Área de administração: utilizadores, notícias, exportação/importação e auditoria.

A interface comunica com `auth` e `api` exclusivamente por HTTP. O interceptor de 401 renova automaticamente o access token via `refresh-server` sem interromper o utilizador. Os formulários de upload usam multipart, e a interface transmite os ficheiros para a API sem os processar localmente.

---

## 9. Segurança, Validação e Observabilidade

### Segurança

- `helmet` ativo em todos os serviços para headers HTTP defensivos.
- CORS configurável com lista de origens permitidas.
- Rate limiting global no gateway, na API e no login do `auth` (in-memory, por janela temporal).
- JWT com access token de curta duração e refresh token HttpOnly.
- Token interno entre serviços para endpoints não públicos.
- Validação de payloads e campos obrigatórios nas rotas principais.
- Limites de tamanho e whitelist de extensões em uploads.
- Proteção contra zip-slip nos pacotes SIP.
- Soft-delete de utilizadores (o documento fica marcado como inativo, o email é anonimizado).

### Validação

O módulo `lib/metadataValidator.js` centraliza a validação do contrato de metadados `metadata.resource`, aplicado de forma consistente na submissão simples, no ingest de SIP ZIP e na atualização via PATCH. Os limites de campo são:

| Campo            | Tipo          | Obrigatório | Limite                                                      |
| ---------------- | ------------- | ------------ | ----------------------------------------------------------- |
| `tipo`         | string (enum) | Sim          | máx 80 caracteres                                          |
| `titulo`       | string        | Sim          | máx 200 caracteres                                         |
| `visibilidade` | enum          | Sim          | `publico` ou `privado`                                  |
| `subtitulo`    | string        | Não         | máx 200 caracteres                                         |
| `descricao`    | string        | Não         | máx 2000 caracteres                                        |
| `tema`         | string        | Não         | máx 120 caracteres                                         |
| `ano`          | inteiro       | Não         | 0–3000                                                     |
| `dataCriacao`  | string (data) | Não         | ISO 8601                                                    |
| `hashtags`     | array         | Não         | máx 20 entradas, cada uma máx 80 caracteres, sem espaços |

Além da validação de metadados, a API tem middlewares próprios em `services/api/middleware/validate.js` para validar campos de texto obrigatórios, inteiros no body, paginação (`page`/`limit`) e inteiros opcionais na query, como o filtro `ano`. Esses validadores são usados em recursos, posts, comentários, notícias e ratings; por exemplo, `stars` tem de ser inteiro entre 1 e 5 e os endpoints paginados recusam valores inválidos antes de chegar aos controladores.

No serviço `auth`, a validação de entrada cobre os casos críticos de identidade: registo com `nome`, `email` e `password`, login com `password` e um identificador (`email` ou `username`), refresh token válido, utilizador ativo e roles administrativas válidas. A validação do modelo Mongoose e do `UserService` complementa os middlewares, garantindo email único, formato de email, password mínima, role permitida e remoção da password nas respostas JSON.

### Observabilidade

- Health check em todos os serviços (`/health`).
- `requestId` único por pedido nos serviços `api` e `auth`, propagado nos logs e nas respostas.
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
Utilizador autenticado seleciona filtros e clica "Exportar"
    ↓
Interface chama GET /api/export com filtros como query params
    ↓
API restringe permissões e filtros conforme o perfil
Recolhe entidades de MongoDB com filtros aplicados
Se for admin, pede utilizadores ao auth via /internal/transfer/users
Exporta ficheiros AIP em base64
    ↓
Devolve dump JSON com version: "2"
    ↓
--- importação noutro ambiente ---
Admin ou produtor submete ficheiro de dump
    ↓
API valida version do dump e permissões de importação
Faz upsert das coleções permitidas pelo perfil
Se for admin, envia utilizadores para auth via /internal/transfer/users (POST)
Repõe ficheiros AIP em disco
    ↓
Devolve resultado com contadores e erros por coleção
```

---

## 11. Testes Automatizados

O projeto inclui testes unitários e de integração ligeiros em `services/api/testes/`, usando o módulo nativo `node:test` do Node.js:

| Ficheiro                        | Cobertura                                               |
| ------------------------------- | ------------------------------------------------------- |
| `metadataValidator.test.js`   | Validação centralizada de metadados                   |
| `resourceAccess.test.js`      | Lógica de visibilidade e controlo de acesso a recursos |
| `validateMiddleware.test.js`  | Middlewares de validação de body e query              |
| `uploadMiddleware.test.js`    | Upload single e múltiplo com limites e tipos           |
| `rateLimitApi.test.js`        | Rate limiting da API                                    |
| `autorizacao.test.js`         | Middlewares `requireLevel` e `optionalAuth`         |
| `simpleZip.test.js`           | Criação de ZIPs e validação de caminhos             |
| `pacoteSimples.test.js`       | Construção automática de SIP BagIt                   |
| `aipStorage.test.js`          | Operações sobre ficheiros AIP em disco                |
| `dip.test.js`                 | Geração do DIP a partir do AIP                        |
| `transferFilters.test.js`     | Filtros de exportação/importação                    |
| `transferPermissions.test.js` | Permissões de transferência por perfil                |
| `oaisAccess.test.js`          | Rota de acesso OAIS (mocks de módulos)                 |
| `oaisIngest.test.js`          | Rota de ingestão OAIS (mocks de módulos)              |

Os testes de rota usam mocking manual do cache de módulos do Node.js para isolar dependências externas (MongoDB, auth, filesystem) sem frameworks adicionais.

---

## 12. Conclusão

A plataforma EW2026 implementa uma solução completa para recursos educativos preservados segundo o modelo OAIS. A arquitetura por serviços separa claramente as responsabilidades: o `auth` gere identidade, a `api` gere domínio e preservação, a `interface` entrega a experiência web e o `gateway` organiza a entrada pública.

As decisões arquiteturais procuram equilibrar simplicidade e robustez. MongoDB guarda entidades flexíveis e pesquisáveis, enquanto o AIP fica em disco como pacote arquivístico independente. O backend concentra todas as regras de segurança e a interface atua como camada de apresentação. A auditoria persistente, a documentação Swagger por serviço e os testes automatizados contribuem para a rastreabilidade e qualidade do sistema.

O resultado é uma plataforma capaz de suportar submissão, validação, preservação, disseminação, interação social, administração e transferência de dados, mantendo uma correspondência clara com os conceitos fundamentais de Producer, SIP, Ingest, AIP, Access, DIP e Consumer do modelo OAIS.
