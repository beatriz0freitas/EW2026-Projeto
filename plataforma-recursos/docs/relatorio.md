# Relatório do Projeto

## Plataforma de Recursos Educativos EW2026

### 1. Introdução

Este relatório documenta a solução desenvolvida para a plataforma de recursos educativos EW2026. O projeto foi construído com o objetivo de disponibilizar uma aplicação completa para submissão, preservação, consulta e disseminação de recursos educativos, integrando autenticação, perfis de utilizador, gestão administrativa, interação social e documentação técnica através de Swagger/OpenAPI.

A solução segue uma abordagem orientada a serviços. Em vez de concentrar toda a lógica numa única aplicação, o sistema foi dividido em componentes com responsabilidades específicas: `gateway`, `auth`, `api` e `interface`. Esta decisão permite separar autenticação, domínio aplicacional, interface web e encaminhamento externo, tornando o projeto mais claro, mais fácil de testar e mais próximo de uma arquitetura real de produção.

Conceptualmente, o projeto assenta no modelo OAIS, com um fluxo de preservação que distingue SIP, AIP e DIP:

- SIP, ou Submission Information Package, é o pacote submetido pelo produtor.
- AIP, ou Archival Information Package, é a representação preservada pelo sistema.
- DIP, ou Dissemination Information Package, é o pacote entregue ao consumidor no momento de acesso.

Esta distinção é importante porque evita tratar o ficheiro submetido como simples upload sem semântica arquivística. O sistema valida o pacote recebido, guarda uma versão preservada com metadados e rastreabilidade, e só depois gera pacotes de disseminação a partir do arquivo.

### 2. Arquitetura Geral

A aplicação é executada em contentores Docker, com `nginx` como ponto de entrada externo e uma rede interna partilhada pelos serviços. A base de dados usada é MongoDB, enquanto os ficheiros AIP são persistidos em disco através de um volume próprio.

Os principais componentes são:

- `nginx`: entrada pública em `localhost:16020`, responsável por encaminhar tráfego para o gateway.
- `gateway`: camada de routing público e proxy para os restantes serviços.
- `auth`: serviço de autenticação, sessões, utilizadores e perfis.
- `api`: serviço principal de domínio, onde vivem recursos, OAIS, posts, comentários, ratings, notícias e transferência de dados.
- `interface`: aplicação web server-side, construída com Express e Pug, que oferece a experiência de utilização ao utilizador final.
- `mongodb`: persistência documental das entidades do domínio.
- `data/aip`: armazenamento dos pacotes arquivísticos preservados.

O fluxo externo típico passa pelo `nginx`, segue para o `gateway` e é encaminhado para a `interface`, `api` ou `auth` conforme a rota. Internamente, os serviços comunicam entre si através de URLs Docker, por exemplo `http://api:16025` e `http://auth:16027`.

```text
Utilizador
    ↓
nginx
    ↓
gateway
    ├── interface
    ├── api
    └── auth
            ↓
          MongoDB

api
    ├── MongoDB
    └── storage AIP em disco
```

A separação por serviços foi uma decisão arquitetural central. O `auth` não conhece detalhes de recursos educativos, e a `api` não gere passwords diretamente. A `interface` não implementa regras de domínio críticas; consome os serviços por HTTP. Esta divisão reduz acoplamento e torna cada serviço mais simples de compreender.

### 3. Decisões Arquiteturais

#### 3.1 Separação entre API, Auth e Interface

A autenticação foi isolada no serviço `auth` para concentrar num único ponto as responsabilidades de registo, login, emissão de tokens, refresh tokens, verificação de sessão e gestão de utilizadores. Isto evita espalhar lógica sensível por vários módulos.

A `api` concentra o domínio da plataforma: recursos, pacotes OAIS, fóruns, comentários, avaliações, notícias e exportação/importação de dados. Esta separação deixa claro que a API é o núcleo funcional do sistema.

A `interface` é uma aplicação web server-side. Ela renderiza páginas HTML, gere formulários, sessões web e feedback visual. Sempre que precisa de dados ou ações, chama `auth` ou `api`. Esta opção permitiu criar uma aplicação utilizável sem duplicar a lógica de negócio no frontend.

#### 3.2 Gateway e bloqueio de rotas internas

O `gateway` existe para organizar a fronteira pública. Ele encaminha `/api/*`, `/auth/*` e as páginas da interface, mas também bloqueia rotas internas que não devem estar disponíveis publicamente. Por exemplo, endpoints usados entre serviços, como publicação interna de notícias de sistema ou renovação server-side de tokens, são protegidos por regras no gateway e por tokens internos.

Esta decisão reforça a separação entre API pública e API interna. Mesmo que uma rota exista num serviço, isso não significa que deva ser exposta a utilizadores externos.

#### 3.3 MongoDB para metadados e disco para AIP

O MongoDB é adequado para guardar documentos flexíveis como recursos, notícias, posts e utilizadores. Os metadados dos recursos variam conforme o tipo de recurso e encaixam bem num modelo documental.

Os ficheiros AIP, por outro lado, são preservados em disco. Esta decisão evita guardar pacotes binários grandes diretamente na base de dados e torna o armazenamento arquivístico mais transparente. Cada recurso tem uma pasta própria com o pacote preservado, incluindo o SIP original e a estrutura `bag/`.

#### 3.4 Segurança no backend

As permissões são sempre validadas no backend. A interface pode esconder botões ou páginas, mas a decisão final pertence aos serviços. Recursos privados só podem ser acedidos pelo produtor responsável ou por administradores. Operações administrativas exigem perfil `admin`. Submissão e edição de recursos exigem `produtor` ou `admin`.

Os serviços usam JWT para autenticação e refresh token para renovação de sessão. A interface guarda uma sessão web e comunica com o `auth` para verificar e renovar tokens quando necessário.

#### 3.5 Documentação OpenAPI

Cada serviço expõe a sua documentação OpenAPI. Isto foi mantido como parte da arquitetura porque ajuda a validar endpoints, testar fluxos e tornar o sistema mais observável. O `gateway`, a `api`, o `auth` e a `interface` têm ficheiros Swagger próprios, refletindo a responsabilidade de cada serviço.

### 4. Modelo Conceptual e Entidades

O domínio principal da plataforma gira em torno de recursos educativos e da sua preservação. Um recurso representa um objeto educativo submetido por um produtor. Este recurso contém metadados, visibilidade, referência ao produtor, contadores e ligação ao AIP preservado.

As entidades principais são:

- `User`: utilizador autenticável, com role `admin`, `produtor` ou `consumidor`.
- `Resource`: recurso educativo, com metadados, produtor, visibilidade e contadores.
- `Aip`: registo arquivístico associado ao recurso, com validações, estado, checksum e localização em disco.
- `Post`: publicação social associada ou não a um recurso.
- `Comment`: comentário feito num post.
- `Rating`: avaliação de um recurso por utilizador.
- `NewsItem`: notícia manual ou gerada pelo sistema.

Os perfis têm responsabilidades distintas:

| Perfil | Capacidades principais |
| --- | --- |
| `consumidor` | Consultar recursos públicos, descarregar recursos públicos, comentar, avaliar e criar posts quando autenticado. |
| `produtor` | Submeter recursos, gerir os seus recursos, além das capacidades de consumidor. |
| `admin` | Gerir utilizadores, notícias, recursos e transferência de dados; tem acesso global. |

A visibilidade dos recursos é uma regra conceptual importante. Recursos públicos podem ser consultados por qualquer utilizador. Recursos privados exigem autenticação e só são acessíveis ao produtor ou a administradores. Esta regra é aplicada tanto na listagem e detalhe como no download do DIP.

### 5. Fluxo OAIS: Submissão, Preservação e Acesso

O fluxo OAIS é uma das partes centrais do projeto. O sistema aceita dois modos de submissão:

- submissão simples, em que o produtor preenche metadados e anexa ficheiros;
- submissão avançada, em que o produtor envia diretamente um SIP ZIP preparado.

Na submissão simples, a API gera automaticamente um pacote SIP a partir dos campos e ficheiros recebidos. Na submissão avançada, o ZIP enviado já deve respeitar a estrutura esperada.

O fluxo conceptual é:

```text
Produtor
    ↓
Submissão de ficheiros ou SIP preparado
    ↓
Validação estrutural, semântica, segurança e consistência
    ↓
Criação de Resource e Aip
    ↓
Persistência do AIP em disco
    ↓
Disponibilização futura como DIP
```

O SIP atual é um ZIP com `manifest.json` na raiz, pasta `data/`, `bagit.txt` opcional e `checksums.txt` opcional. O manifesto contém os metadados e a lista de ficheiros esperados.

Durante o ingest, a API valida:

- se o ficheiro recebido é ZIP válido;
- se existe `manifest.json`;
- se existe pasta `data/`;
- se os ficheiros declarados existem;
- se os checksums coincidem, quando fornecidos;
- se os metadados obrigatórios estão presentes;
- se os tipos e visibilidade são válidos;
- se os caminhos são seguros, prevenindo zip-slip;
- se os limites de tamanho e extensões são respeitados.

Quando a validação passa, o sistema cria um documento `Resource`, um documento `Aip` e uma pasta no armazenamento AIP. A pasta preserva o conteúdo arquivístico e o ZIP original.

No acesso, o consumidor não recebe simplesmente o ficheiro original submetido. A API gera um DIP a partir do AIP preservado. Antes disso, confirma se o recurso existe e se o utilizador tem permissão para aceder. Em caso de sucesso, devolve um ZIP e incrementa os contadores de download no recurso e no AIP.

Esta decisão garante rastreabilidade e preservação: o download é sempre derivado da versão arquivada.

### 6. Serviço Auth

O serviço `auth` gere utilizadores e autenticação. As funcionalidades principais são:

- registo público de novos utilizadores;
- login por email ou username;
- emissão de access token JWT;
- emissão e renovação de refresh token;
- verificação de sessão;
- logout;
- login/registo OAuth usado pela interface, quando providers estão configurados;
- listagem, atualização e desativação de utilizadores por administradores;
- endpoints internos para exportação/importação de utilizadores.

As passwords são armazenadas com hash `bcrypt` e removidas das respostas públicas. O registo público força o perfil `consumidor`, mesmo que o cliente envie outro perfil. Isto impede escalada de privilégios no momento de criação de conta.

O serviço usa roles para controlo de acesso. O middleware de autenticação lê o token, valida a sessão e injeta o utilizador autenticado no pedido. Rotas administrativas exigem `admin`.

Com a funcionalidade de transferência de dados, o `auth` passou a expor endpoints internos protegidos por `X-Internal-Token` para exportar e importar utilizadores. Esta opção mantém a posse dos dados de utilizador no serviço correto, sem obrigar a `api` a importar diretamente modelos do `auth`.

### 7. Serviço API

O serviço `api` é o núcleo de domínio. As suas áreas principais são:

#### 7.1 Recursos e AIP

A API permite listar, consultar, editar e apagar recursos. A criação de recursos acontece através do ingest OAIS. Quando um recurso é removido, a API também remove a rastreabilidade AIP e os ficheiros preservados em disco.

As listagens aplicam visibilidade conforme o utilizador. Um visitante vê recursos públicos. Um produtor autenticado vê públicos e os seus privados. Um admin vê todos.

#### 7.2 Posts, comentários e ratings

O projeto inclui uma camada social para discussão de recursos educativos. Utilizadores autenticados podem criar posts, comentar e avaliar recursos. Posts e comentários respeitam permissões de visibilidade dos recursos associados.

As avaliações usam uma relação por recurso e utilizador. Isto permite calcular estatísticas como média e total de votos. Essas estatísticas também são usadas para gerar notícias de sistema relacionadas com recursos populares.

#### 7.3 Notícias manuais e de sistema

Existem notícias criadas manualmente por administradores e notícias criadas automaticamente pelo sistema. A API tem um endpoint interno para receber eventos de sistema, protegido por token interno.

Dois exemplos de notícias automáticas são:

- atualização do total de utilizadores, publicada pelo `auth`;
- Top 3 de recursos mais requisitados, calculado pela API com base em downloads e ratings.

O Top 3 considera apenas recursos públicos e evita republicar a mesma notícia quando a assinatura do ranking não muda.

#### 7.4 Exportação e importação

A API disponibiliza endpoints administrativos de exportação e importação. O dump inclui recursos, AIP, notícias, posts, ratings, comentários e utilizadores. Como os utilizadores pertencem ao `auth`, a API comunica com o serviço `auth` através de endpoints internos para obter ou restaurar esses dados.

Os filtros de transferência permitem exportar ou importar subconjuntos, por exemplo apenas recursos, apenas notícias ou apenas utilizadores. A importação usa upsert por `_id`, tornando o processo idempotente e seguro para repetir.

### 8. Interface Web

A `interface` é a camada de experiência do utilizador. Foi construída como aplicação Express server-side com Pug. Esta escolha simplifica a entrega de páginas e formulários, evita a necessidade de um frontend SPA complexo e mantém o foco nos fluxos principais do projeto.

Funcionalidades disponíveis:

- página inicial com recursos e notícias;
- login, registo e logout;
- OAuth Google/Facebook quando configurado;
- listagem e detalhe de recursos;
- submissão simples de recursos;
- submissão avançada de SIP ZIP;
- download de DIP;
- criação e consulta de posts;
- comentários em posts;
- avaliação de recursos;
- administração de utilizadores;
- administração de notícias;
- exportação e importação de dados;
- página administrativa de dados;
- consulta de auditoria administrativa em `/admin/audit`.

A interface comunica com a API e o Auth por HTTP. Quando recebe erros dos serviços, transforma-os em mensagens para o utilizador. Para uploads e importações usa formulários multipart, preservando o funcionamento tradicional de uma aplicação web.

### 9. Segurança, Validação e Observabilidade

A segurança do projeto é composta por várias camadas:

- `helmet` para headers HTTP defensivos;
- CORS configurável;
- rate limit nas APIs;
- JWT e refresh token;
- cookies de sessão na interface;
- roles e hierarquia de permissões;
- token interno para comunicação entre serviços;
- validação de payloads e campos obrigatórios;
- limites de tamanho em uploads;
- validação de extensão e MIME type;
- proteção contra zip-slip nos pacotes SIP.

Cada serviço também inclui `health check` e documentação OpenAPI. Os serviços registam pedidos com `requestId`, facilitando depuração e correlação de logs.

A decisão de manter Swagger por serviço ajuda a separar responsabilidades e a validar que cada componente expõe apenas o que deve expor. O gateway também documenta o seu papel de proxy, incluindo rotas wildcard.

Para reforçar a rastreabilidade, foi introduzido um mecanismo de auditoria persistente. A API regista eventos HTTP e ações relevantes em MongoDB, numa coleção dedicada chamada `audit_logs`. Cada registo inclui serviço, ação, método, caminho, estado, código HTTP, utilizador, alvo, IP, user-agent, metadados sanitizados e `requestId`.

A API expõe `GET /api/audit` para consulta administrativa e `POST /api/internal/audit` para receção de eventos internos. O endpoint interno é protegido por `X-Internal-Token` e bloqueado no gateway público, ficando disponível apenas para comunicação entre serviços. O Auth publica eventos sensíveis, como login com sucesso, falha de login, registo, OAuth, alteração de perfil e desativação de utilizadores, para esse endpoint interno. A Interface disponibiliza uma página administrativa em `/admin/audit`, onde o admin pode filtrar por ação, serviço, estado, utilizador, alvo e intervalo temporal.

### 10. Fluxos Principais

#### 10.1 Registo e login

```text
Utilizador submete registo
    ↓
auth valida campos
    ↓
password é guardada com hash
    ↓
conta é criada como consumidor
```

No login:

```text
Utilizador envia credenciais
    ↓
auth valida email/username e password
    ↓
emite access token e refresh token
    ↓
interface guarda sessão web
```

#### 10.2 Submissão de recurso

```text
Produtor autenticado abre formulário
    ↓
interface envia ficheiros e metadados
    ↓
api constrói ou recebe SIP
    ↓
api valida o pacote
    ↓
api cria Resource + Aip
    ↓
api guarda AIP em disco
    ↓
recurso fica disponível conforme visibilidade
```

#### 10.3 Download de recurso

```text
Utilizador pede DIP
    ↓
api carrega Resource
    ↓
api verifica visibilidade e permissões
    ↓
api lê AIP preservado
    ↓
api gera ZIP DIP
    ↓
downloadCount é incrementado
```

#### 10.4 Exportação e importação

```text
Admin escolhe filtros
    ↓
interface chama /api/export
    ↓
api recolhe dados de domínio
    ↓
api pede users ao auth por rota interna
    ↓
dump JSON é devolvido
```

Na importação:

```text
Admin submete dump
    ↓
api valida version e filtros
    ↓
api faz upsert das coleções de domínio
    ↓
api envia users ao auth para upsert interno
    ↓
api restaura ficheiros AIP
    ↓
resultado agregado é apresentado ao admin
```

#### 10.5 Auditoria

```text
Utilizador executa uma ação na API
    ↓
middleware de auditoria observa o pedido e a resposta
    ↓
evento é guardado em audit_logs
    ↓
admin consulta /admin/audit com filtros
```

Para ações originadas no Auth:

```text
auth conclui login, registo ou alteração de user
    ↓
auth envia evento para /api/internal/audit
    ↓
api valida X-Internal-Token
    ↓
evento é guardado em audit_logs
```

### 11. Limitações e Trabalho Futuro

Embora a solução cubra os fluxos principais, existem áreas que podem evoluir:

- adicionar testes automatizados de integração para ingest, access, auth e import/export;
- reforçar validação semântica dos metadados por tipo de recurso;
- adicionar alertas sobre eventos críticos de auditoria, como muitas falhas de login, importações frequentes ou eliminações em massa;
- introduzir armazenamento de objetos para AIP em vez de disco local;
- criar métricas operacionais para downloads, ingestões falhadas e atividade de utilizadores;
- melhorar a gestão de versões dos recursos;
- expandir o modelo de preservação com metadados PREMIS ou METS;
- detalhar políticas de retenção e recuperação.

### 12. Conclusão

A plataforma EW2026 implementa uma solução completa para recursos educativos preservados segundo uma lógica OAIS. A arquitetura por serviços separa responsabilidades e torna o sistema compreensível: o `auth` gere identidade, a `api` gere domínio e preservação, a `interface` entrega a experiência web e o `gateway` organiza a entrada pública.

As principais decisões arquiteturais procuram equilibrar simplicidade e robustez. MongoDB guarda entidades flexíveis e pesquisáveis, enquanto o AIP fica em disco como pacote arquivístico. O backend concentra regras de segurança, e a interface atua como camada de utilização. A documentação Swagger por serviço reforça testabilidade e transparência.

O resultado é uma plataforma capaz de suportar submissão, validação, preservação, disseminação, interação social, administração e transferência de dados, mantendo uma correspondência clara com os conceitos fundamentais de Producer, SIP, Ingest, AIP, Access, DIP e Consumer.
