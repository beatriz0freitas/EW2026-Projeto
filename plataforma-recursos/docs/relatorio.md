# EW2026 - Plataforma de Recursos Educativos

## 1. Introdução

Este relatório apresenta a solução desenvolvida para a Proposta 1 do projeto inserido na unidade curricular de Engenharia Web 2026, cujo objetivo consistiu na criação de uma plataforma de gestão, disponibilização e discussão de recursos educativos. A aplicação permite que utilizadores autenticados, com permissões diferentes consoante o seu perfil, submetam recursos, consultem conteúdos, descarreguem pacotes de disseminação, avaliem materiais, participem em discussões e acompanhem notícias relacionadas com a atividade da plataforma.

A solução foi pensada para responder simultaneamente a duas necessidades. A primeira é a preservação dos recursos, garantindo que uma submissão não é tratada como um simples carregamento de ficheiros, mas como um pacote que deve ser validado, registado, preservado e posteriormente reutilizado. A segunda é a utilização quotidiana da plataforma, isto é, a possibilidade de navegar pelos recursos, aceder aos seus metadados, fazer download, comentar, classificar e administrar informação de forma simples.

O modelo OAIS foi usado como referência conceptual para organizar o ciclo de vida dos recursos. Neste contexto, o SIP corresponde ao pacote submetido pelo produtor, o AIP corresponde ao pacote arquivístico preservado pelo sistema e o DIP corresponde ao pacote entregue ao consumidor quando este descarrega um recurso. Esta separação implica que o utilizador não recebe diretamente o ficheiro original submetido, mas sim uma representação de disseminação gerada a partir do arquivo preservado.

Assim, a plataforma procura equilibrar usabilidade e robustez. Para o produtor, existe uma submissão simples através da interface, onde basta preencher metadados e anexar ficheiros. Para cenários mais técnicos, existe também a submissão avançada de um SIP já preparado. Em ambos os casos, o sistema converge para o mesmo fluxo de validação e preservação, garantindo coerência interna.

## 2. Objetivos e Âmbito da Solução

O projeto teve como objetivo construir uma aplicação completa para recursos educativos, desde a entrada do recurso no sistema até à sua consulta e reutilização por outros utilizadores. Para isso, foram implementadas funcionalidades de autenticação, autorização por perfis, gestão de recursos, preservação OAIS, download de DIP, comunicação social em torno dos recursos, notícias, auditoria e mecanismos de exportação/importação de dados.

Os requisitos do enunciado foram cobertos através de vários módulos articulados entre si. O upload e a validação dos pacotes são assegurados pelos endpoints OAIS da API. A conversão de SIP para AIP ocorre durante o ingest, com criação dos documentos `Resource` e `Aip` e escrita dos pacotes em disco. A conversão de AIP para DIP é feita no momento do acesso, garantindo que o download resulta sempre do conteúdo preservado. A administração de recursos, utilizadores, notícias e dados é disponibilizada por endpoints próprios e refletida na interface web.

Foram considerados três perfis de utilização: `admin`, `produtor` e `consumidor`. O administrador tem acesso total à plataforma; o produtor pode criar recursos e gerir os seus próprios conteúdos; o consumidor pode consultar, descarregar e interagir com recursos acessíveis. Esta hierarquia permite que a plataforma sirva tanto a vertente de gestão como a vertente de consumo dos materiais educativos.

Para além da gestão base de recursos, a plataforma inclui funcionalidades complementares que tornam o sistema mais completo: posts associados a recursos, comentários, classificações por estrelas, notícias manuais e automáticas, exportação filtrada, importação controlada, documentação Swagger/OpenAPI e registos de auditoria. Estas funcionalidades reforçam a ideia de que a aplicação não é apenas um repositório estático, mas um espaço de publicação, preservação e interação.

## 3. Visão Geral da Arquitetura

A aplicação foi organizada em serviços separados e executa em Docker Compose. Esta divisão foi escolhida para manter responsabilidades claras e evitar que autenticação, regras de domínio, interface e entrada pública ficassem concentradas num único processo. O resultado é uma arquitetura simples de compreender, mas suficientemente modular para permitir evolução futura.

```text
Utilizador
    |
    v
nginx (localhost:16020)
    |
    v
gateway
    |-- /api/*   -> api
    |-- /auth/*  -> auth ou páginas de autenticação da interface
    |-- /docs    -> hub Swagger/OpenAPI
    `-- /*       -> interface

api       -> MongoDB + armazenamento AIP em disco
auth      -> MongoDB
interface -> API + Auth
```

O `nginx` é a porta de entrada externa e expõe a aplicação em `localhost:16020`. A seguir encontra-se o `gateway`, que encaminha pedidos para os serviços internos, agrega a documentação OpenAPI, aplica CORS, rate limiting e bloqueia rotas que não devem ser chamadas diretamente pelo exterior. O serviço `auth` concentra o registo, login, refresh token, OAuth opcional e gestão de utilizadores. O serviço `api` contém o domínio principal da aplicação: recursos, OAIS, posts, comentários, ratings, notícias, auditoria e transferência de dados. A `interface` disponibiliza a aplicação web server-side, construída com Express e Pug. Por fim, o MongoDB guarda os documentos da aplicação e a pasta `data/aip` preserva os pacotes arquivísticos em disco.

Esta separação também melhora a segurança. A interface pode esconder ou mostrar ações de acordo com o utilizador, mas a decisão final é sempre tomada no backend. Mesmo que alguém tente chamar diretamente a API, as permissões são novamente verificadas. Além disso, existem endpoints internos protegidos por `INTERNAL_SERVICE_TOKEN`, usados apenas para comunicação entre serviços, como refresh server-side, notícias de sistema e algumas operações de auditoria ou transferência.

O `gateway` bloqueia explicitamente rotas internas como `/api/news/system`, `/api/internal/audit`, `/auth/sessions/verify` e `/auth/sessions/refresh-server`. Estas rotas continuam disponíveis dentro da rede Docker quando acompanhadas do token interno, mas não fazem parte da superfície pública da aplicação.

## 4. Decisões de Desenho

Uma das primeiras decisões foi separar os serviços por responsabilidade. O `auth` ficou dedicado à identidade dos utilizadores, o `api` ficou responsável pelo domínio dos recursos e o `interface` ficou responsável pela apresentação. Esta organização torna o código mais fácil de manter, porque cada serviço tem uma fronteira funcional clara. Também permite que a segurança seja aplicada perto dos dados, e não apenas no frontend.

O MongoDB foi escolhido para persistir metadados e entidades da aplicação porque os documentos manipulados pela plataforma têm uma estrutura naturalmente flexível. Recursos, notícias, posts, ratings e registos de auditoria podem evoluir sem exigir migrações relacionais complexas. Por outro lado, os ficheiros dos recursos não são guardados diretamente na base de dados. Os AIPs são preservados em disco, na pasta configurada por `AIP_DIR`, porque os pacotes podem ser grandes e devem manter uma estrutura arquivística própria.

Outra decisão importante foi renderizar a interface no servidor com Express e Pug. Como o projeto não exigia uma SPA e a lógica crítica vive nos serviços backend, esta abordagem reduziu duplicação de regras no frontend e simplificou o fluxo de autenticação. A interface atua como camada de experiência do utilizador, enquanto a API e o serviço de autenticação continuam a ser as fontes de verdade.

O `gateway` organiza a fronteira pública. Encaminha `/api/*`, `/auth/*` e as páginas da interface, mas bloqueia explicitamente rotas internas que não devem estar disponíveis publicamente. Por exemplo, o endpoint de publicação interna de notícias de sistema (`/api/news/system`), o endpoint interno de auditoria (`/api/internal/audit`) e o de renovação server-side de tokens (`/auth/sessions/refresh-server`) são bloqueados no gateway e protegidos adicionalmente por tokens internos nos serviços.

No domínio OAIS, a decisão mais relevante foi gerar o DIP sempre a partir do AIP preservado. Isto garante que o download reflete o estado arquivado e não depende de um ficheiro temporário ou de uma submissão original sem validação. Ao mesmo tempo, a estrutura técnica do AIP não é exposta ao consumidor final: o DIP inclui os ficheiros de consumo e um ficheiro de metadados, mas oculta elementos internos como `sip.zip`, `bagit.txt` e `checksums.txt`.

## 5. Modelo de Domínio

O domínio da aplicação é composto por entidades simples, mas articuladas. O `User` representa um utilizador autenticável e contém o perfil que determina as suas permissões. O `Resource` representa o recurso educativo propriamente dito, com metadados, produtor, visibilidade, caminho para o AIP e contador de downloads. O `Aip` é o registo de preservação associado ao recurso e contém o resultado das validações, o estado do ingest, o checksum do SIP e a localização em disco.

À volta dos recursos existem entidades de interação. Um `Post` é uma publicação associada a um recurso, um `Comment` é uma resposta a um post e um `Rating` representa uma avaliação de 1 a 5 estrelas feita por um utilizador a um recurso. As notícias são modeladas por `NewsItem` e podem ser criadas manualmente por administradores ou automaticamente pelo sistema. Finalmente, o `AuditLog` regista ações relevantes, permitindo acompanhar o funcionamento da plataforma e analisar operações sensíveis.

Os perfis seguem uma hierarquia direta. O administrador tem acesso total, incluindo gestão de utilizadores, auditoria, importação/exportação global e edição de qualquer recurso. O produtor pode criar recursos, consultar recursos públicos, gerir os seus próprios recursos privados e importar conteúdos que ficam associados a si quando necessário. O consumidor pode consultar recursos públicos, descarregar DIPs, comentar, publicar e classificar, mas não pode criar recursos nem importar dados.

A regra transversal mais importante é a visibilidade do recurso. Um recurso `publico` pode ser consultado por utilizadores autorizados no fluxo normal de leitura e, em alguns endpoints de consulta pública, pode ser visto sem token. Um recurso `privado` só é acessível ao produtor que o criou ou a um administrador. Esta regra não se limita à listagem de recursos: também é aplicada no detalhe, no download, nos posts, nos comentários, nas avaliações e nos mecanismos de transferência de dados.

## 6. Fluxo OAIS: Submissão, Preservação e Acesso

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

## 9. Interação Social e Notícias

```
admin (3)     → permissões máximas, acesso a tudo
  ↓
produtor (2)  → pode criar/editar/apagar os seus recursos e participar na camada social
  ↓
consumidor (1) → leitura de recursos públicos, avaliações, posts e comentários em recursos visíveis
```

| Operação                       | Admin | Produtor | Consumidor |
| -------------------------------- | ----- | -------- | ---------- |
| Ler recursos públicos           | ✓    | ✓       | ✓         |
| Ler recursos privados próprios  | ✓    | ✓       | —         |
| Criar recursos                   | ✓    | ✓       | —         |
| Editar/apagar recursos próprios | ✓    | ✓       | —         |
| Editar/apagar recursos alheios   | ✓    | —       | —         |
| Criar posts e comentários       | ✓    | ✓       | ✓         |
| Avaliar recursos                 | ✓    | ✓       | ✓         |
| Gerir utilizadores               | ✓    | —       | —         |
| Exportar dados visíveis          | ✓    | ✓       | ✓         |
| Importar dados                   | ✓    | recursos próprios | — |

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

| Ficheiro                       | Cobertura                                               |
| ------------------------------ | ------------------------------------------------------- |
| `metadataValidator.test.js`  | Validação centralizada de metadados                   |
| `resourceAccess.test.js`     | Lógica de visibilidade e controlo de acesso a recursos |
| `validateMiddleware.test.js` | Middlewares de validação de body e query              |
| `uploadMiddleware.test.js`   | Upload single e múltiplo com limites e tipos           |
| `rateLimitApi.test.js`       | Rate limiting da API                                    |
| `autorizacao.test.js`        | Middlewares `requireLevel` e `optionalAuth`         |
| `simpleZip.test.js`          | Criação de ZIPs e validação de caminhos             |
| `pacoteSimples.test.js`      | Construção automática de SIP BagIt                   |
| `aipStorage.test.js`         | Operações sobre ficheiros AIP em disco                |
| `dip.test.js`                | Geração do DIP a partir do AIP                        |
| `transferFilters.test.js`    | Filtros de exportação/importação                    |
| `transferPermissions.test.js` | Permissões de transferência por perfil               |
| `oaisAccess.test.js`         | Rota de acesso OAIS (mocks de módulos)                 |
| `oaisIngest.test.js`         | Rota de ingestão OAIS (mocks de módulos)              |

Os testes de rota usam mocking manual do cache de módulos do Node.js para isolar dependências externas (MongoDB, auth, filesystem) sem frameworks adicionais.


---

## 12. Conclusão

A plataforma EW2026 implementa uma solução completa para recursos educativos preservados segundo o modelo OAIS. A arquitetura por serviços separa claramente as responsabilidades: o `auth` gere identidade, a `api` gere domínio e preservação, a `interface` entrega a experiência web e o `gateway` organiza a entrada pública.

As decisões arquiteturais procuram equilibrar simplicidade e robustez. MongoDB guarda entidades flexíveis e pesquisáveis, enquanto o AIP fica em disco como pacote arquivístico independente. O backend concentra todas as regras de segurança e a interface atua como camada de apresentação. A auditoria persistente, a documentação Swagger por serviço e os testes automatizados contribuem para a rastreabilidade e qualidade do sistema.

O resultado é uma plataforma capaz de suportar submissão, validação, preservação, disseminação, interação social, administração e transferência de dados, mantendo uma correspondência clara com os conceitos fundamentais de Producer, SIP, Ingest, AIP, Access, DIP e Consumer do modelo OAIS.
