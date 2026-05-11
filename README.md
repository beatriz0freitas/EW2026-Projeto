# EngWeb2026

- **Título**: Projeto EW2026 - Plataforma de Recursos Educativos
- **Data**: 11/05/2026
- **Autores**: Luís Miguel Silva Coelho, Rafael Filipe Duarte, Ana Beatriz Freitas
- **UC**: Engenharia Web

## Autores

| Número | Nome | Foto |
| ------ | ---- | ---- |
| A106843 | Luís Miguel Silva Coelho | ![Luís Miguel Silva Coelho](plataforma-recursos/foto.jpeg) |
| A106918 | Rafael Filipe Duarte | ![Rafael Filipe Duarte](plataforma-recursos/eu.png) |
| A106853 | Ana Beatriz Freitas | ![Ana Beatriz Freitas](plataforma-recursos/bf.jpeg) |

## Resumo

Este trabalho consiste no desenvolvimento de uma plataforma web para gestão, preservação, consulta e disseminação de recursos educativos.

A solução foi implementada com uma arquitetura orientada a serviços, composta por `nginx`, `gateway`, `auth`, `api`, `interface`, `mongodb` e armazenamento AIP em disco. O acesso público é feito através do `nginx` e do `gateway`, que encaminham pedidos para a interface web, para o serviço de autenticação ou para a API de domínio.

O sistema implementa autenticação com JWT e refresh tokens, perfis de utilizador (`admin`, `produtor` e `consumidor`), gestão de recursos públicos e privados, camada social com posts, comentários e avaliações, notícias automáticas, auditoria, importação/exportação de dados e documentação OpenAPI/Swagger para os serviços.

Conceptualmente, a plataforma segue o modelo OAIS. Os recursos são submetidos como SIP, validados por camadas, preservados como AIP e disponibilizados ao consumidor através de DIP gerado a partir do arquivo. A submissão pode ser simples, através da interface, ou avançada, através de um SIP ZIP com `manifest.json`, pasta `data/`, `bagit.txt` opcional e `checksums.txt` opcional.

## Lista de Resultados

- `plataforma-recursos/` — aplicação completa da plataforma
  - `docker-compose.yml` — orquestração dos serviços e da base de dados
  - `infra/nginx/default.conf` — configuração do ponto de entrada público
  - `services/` — conjunto dos serviços Node.js da plataforma
    - `services/gateway/` — serviço de encaminhamento e proteção da fronteira pública
      - `services/gateway/middleware/` — middlewares do gateway, incluindo controlo de rate limit
      - `services/gateway/routes/` — rotas públicas que encaminham pedidos para a API, Auth e Interface
      - `services/gateway/lib/` — funções auxiliares de configuração e proxy HTTP
    - `services/auth/` — serviço de autenticação, sessões, utilizadores e perfis
      - `services/auth/middleware/` — middlewares de autenticação, validação, rate limit e proteção de endpoints internos
      - `services/auth/routes/` — rotas de sessões, utilizadores, estado do serviço e transferência interna
      - `services/auth/lib/` — utilitários de JWT, configuração, HTTP, auditoria e publicação de notícias de sistema
      - `services/auth/models/` — modelos MongoDB do domínio de autenticação, como `User`
      - `services/auth/controllers/` — controladores das operações de sessões, utilizadores e transferência interna
      - `services/auth/services/` — lógica de serviço associada à gestão de utilizadores
    - `services/api/` — API principal de recursos, OAIS, posts, comentários, ratings, notícias, auditoria e transferência de dados
      - `services/api/middleware/` — middlewares de autenticação, validação, CORS, uploads, rate limit e tokens internos
      - `services/api/transfer/` — filtros, permissões e cliente Auth usados na importação/exportação de dados
      - `services/api/routes/` — rotas REST para recursos, posts, comentários, avaliações, notícias, auditoria e exportação
      - `services/api/testes/` — testes unitários e de integração da API, incluindo OAIS, permissões, validação e rate limit
      - `services/api/lib/` — utilitários partilhados, como ZIP simples, validação de metadados, HTTP, configuração e controlo de acesso
      - `services/api/models/` — modelos MongoDB da plataforma, incluindo recursos, AIP, posts, comentários, ratings, notícias e auditoria
      - `services/api/audit/` — registo, sanitização e middleware HTTP de auditoria
      - `services/api/controllers/` — controladores das operações de domínio expostas pela API
      - `services/api/oais/` — implementação do fluxo OAIS de submissão, preservação e acesso
        - `services/api/oais/access/` — geração e entrega de DIP a partir dos AIP preservados
        - `services/api/oais/ingest/` — validação e ingestão de SIP simples ou avançados
      - `services/api/jobs/` — tarefas automáticas da API, como geração de notícias de sistema
    - `services/interface/` — interface web server-side em Express e Pug
      - `services/interface/public/` — ficheiros públicos servidos pela interface
        - `services/interface/public/javascripts/` — scripts de apoio às páginas públicas e formulários de recursos
        - `services/interface/public/templates/` — modelos de exemplo usados pela interface, como metadados de submissão
        - `services/interface/public/stylesheets/` — folhas de estilo da aplicação web
      - `services/interface/bin/` — script de arranque HTTP da aplicação
      - `services/interface/routes/` — rotas web para autenticação, recursos, posts, administração e transferência de dados
      - `services/interface/lib/` — utilitários de configuração, chamadas HTTP, helpers web e filtros de transferência de dados
      - `services/interface/views/` — templates Pug comuns da interface
        - `services/interface/views/auth/` — páginas de login e registo
        - `services/interface/views/data/` — páginas de importação e exportação de dados para utilizadores
        - `services/interface/views/admin/` — páginas de administração, utilizadores, notícias, auditoria e transferência de dados
        - `services/interface/views/posts/` — páginas de listagem, detalhe e criação/edição de posts
        - `services/interface/views/resources/` — páginas de listagem, detalhe, criação e edição de recursos
      - `services/interface/controllers/` — controladores server-side que ligam as rotas web aos serviços `api` e `auth`
  - `data/povoamento/` — fixtures, inicialização MongoDB e script de povoamento de recursos
  - `data/aip/` — diretório de preservação dos pacotes AIP
  - `.env.example` — exemplo de configuração de ambiente

---

# Intruções de Execução


## Pré-requisitos

É necessário ter instalado:

- Docker
- Docker Compose v2 (`docker compose`)
- Python 3
- `pip` para instalar a dependência do script de povoamento

Verificação rápida:

```bash
docker --version
docker compose version
python3 --version
pip --version
```

---

## Preparação inicial

Entrar na pasta do projeto:

```bash
cd plataforma-recursos
```

Criar o ficheiro `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Gerar segredos fortes para preencher o `.env`:

```bash
openssl rand -hex 32
```

Preencher as variáveis de ambiente.

---

## Execução

### 1. Levantar os serviços

```bash
docker compose up -d --build
```

### 2. Verificar estado

```bash
docker compose ps
```

### 4. Abrir a aplicação

No browser:

```text
http://localhost:16020
```

### 5. Parar os serviços

```bash
docker compose down
```

---

## Povoamento de recursos

### Instalar a dependência do script

```bash
pip install -r data/povoamento/requirements.txt
```

### 1. Obter um token JWT

O script de povoamento aceita apenas `--token`.

Podes obter um token com `curl` através do endpoint de login:

```bash
curl -s -X POST http://localhost:16020/auth/sessions \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin.teste","password":"Admin123"}'
```

Se o login correr bem, a resposta inclui um campo `token`.

Também podes obter o token no Swagger de `http://localhost:16020/auth/docs` fazendo login manualmente e copiando o valor devolvido.

O script usa estas convenções fixas para manter a simplicidade:

- URL da plataforma: `http://localhost:16020`
- ficheiro de metadados: `metadata.csv`
- tipo por omissão: `artigo`
- visibilidade por omissão: `publico`

### 2. Comando mínimo para povoar recursos

```bash
python3 data/povoamento/povoamento-recursos.py data/recursos --token <TOKEN>
```

### 3. Simular sem enviar nada

```bash
python3 data/povoamento/povoamento-recursos.py data/recursos --token <TOKEN> --dry-run
```

### 4. Processar apenas alguns recursos

```bash
python3 data/povoamento/povoamento-recursos.py data/recursos --token <TOKEN> --only "ficheiro-a.pdf,recurso-02"
```

---

## Swagger

Com a stack a correr, a documentação Swagger fica acessível em:

- `http://localhost:16020/docs`
- `http://localhost:16020/api/docs`
- `http://localhost:16020/auth/docs`
- `http://localhost:16020/interface/docs`

---
