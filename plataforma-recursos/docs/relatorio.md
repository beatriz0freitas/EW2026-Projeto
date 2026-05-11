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

A autenticação usa JWT de curta duração e refresh token de duração superior. Esta combinação permite que os serviços verifiquem a identidade por HTTP sem guardar estado partilhado, mantendo ao mesmo tempo uma experiência de sessão contínua para o utilizador. Quando a interface recebe uma resposta de token expirado, tenta renovar a sessão internamente através do serviço `auth` e repete o pedido original.

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

A plataforma inclui uma camada de interação social associada aos recursos. Qualquer utilizador autenticado, dentro das regras de acesso ao recurso, pode criar posts, comentar publicações e avaliar recursos. Os posts pertencem a um recurso, os comentários pertencem a um post e os ratings são associados ao par utilizador/recurso.

A classificação por estrelas usa uma lógica de atualização em vez de duplicação: se o mesmo utilizador voltar a avaliar o mesmo recurso, a classificação anterior é atualizada. Isto evita que um único utilizador distorça a média através de múltiplas avaliações repetidas.

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

Apesar de funcional, a solução tem algumas limitações assumidas. A interface usa `express-session` em memória, o que é suficiente para desenvolvimento, mas deveria ser substituído por uma store persistente como MongoDB ou Redis num ambiente de produção. Os tipos de recurso já são extensíveis no fluxo principal, mas uma evolução natural seria permitir a sua gestão explícita através de configuração dedicada ou de uma área administrativa.

A API tem testes sobre os componentes principais, mas os serviços `auth`, `gateway` e `interface` ainda beneficiariam de testes próprios. O dataset de demonstração também depende da execução explícita do script de povoamento, pelo que a base de dados inicial não fica completamente carregada apenas com o arranque dos containers. Do ponto de vista operacional, o gateway ainda poderia evoluir com circuit breaker, métricas mais detalhadas e estratégias de fallback para falhas temporárias dos serviços internos.

Como trabalho futuro, faria sentido acrescentar testes end-to-end aos fluxos completos, armazenamento S3-compatível para AIPs, métricas operacionais, gestão administrativa dos tipos de recurso e suporte a metadados de preservação mais ricos, como PREMIS ou Dublin Core. Estes pontos não invalidam a solução atual, mas indicam caminhos claros para a tornar mais robusta e mais próxima de um ambiente de produção.

## 15. Conclusão

A plataforma desenvolvida cumpre o objetivo de gerir e disponibilizar recursos educativos com preservação arquivística, controlo de acessos e funcionalidades de interação. O modelo OAIS foi incorporado no fluxo principal da aplicação: o produtor submete um SIP, o sistema valida e preserva um AIP, e o consumidor recebe um DIP gerado a partir do arquivo.

A arquitetura em serviços separados permitiu organizar melhor as responsabilidades. O `gateway` controla a entrada pública, o `auth` gere identidade e sessões, a `api` concentra o domínio da aplicação e a `interface` oferece uma experiência web utilizável. O MongoDB guarda os documentos e o armazenamento em disco preserva os pacotes AIP.

As decisões tomadas procuram manter equilíbrio entre simplicidade e rigor. A submissão simples torna a plataforma acessível, a submissão avançada mantém flexibilidade técnica, as permissões são validadas no backend, os recursos privados são protegidos em todos os fluxos e a geração do DIP a partir do AIP preservado reforça a coerência do modelo. O resultado é uma solução integrada que cobre preservação, acesso, administração, discussão, notícias, auditoria e transferência de dados, oferecendo uma visão completa do ciclo de vida dos recursos educativos.
