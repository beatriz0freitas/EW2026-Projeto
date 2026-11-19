# EngWeb2026 — Plataforma de Recursos Educativos

- **UC**: Engenharia Web (2025/2026)
- **Título**: Plataforma de Recursos Educativos com preservação digital (modelo OAIS) e extensão de IA
- **Autores**: Ana Beatriz Freitas, Luís Miguel Silva Coelho, Rafael Filipe Duarte

## Autores

| Ana Beatriz Freitas (A106853) | Luís Miguel Silva Coelho (A106843) | Rafael Filipe Duarte (A106918) |
| :---: | :---: | :---: |
| <img src=".github/images/bf.jpeg" width="180" alt="Ana Beatriz Freitas"> | <img src=".github/images/foto.jpeg" width="180" alt="Luís Miguel Silva Coelho"> | <img src=".github/images/eu.png" width="180" alt="Rafael Filipe Duarte"> |

## Resumo

Este trabalho consiste no desenvolvimento de uma plataforma web para gestão, preservação, consulta e disseminação de recursos educativos.

A solução foi implementada com uma arquitetura orientada a serviços, composta por `nginx`, `gateway`, `auth`, `api`, `interface`, `mongodb` e armazenamento AIP em disco. O acesso público é feito através do `nginx` e do `gateway`, que encaminham pedidos para a interface web, para o serviço de autenticação ou para a API de domínio.

O sistema implementa autenticação com JWT e refresh tokens, perfis de utilizador (`admin`, `produtor` e `consumidor`), gestão de recursos públicos e privados, camada social com posts, comentários e avaliações, notícias automáticas, auditoria, importação/exportação de dados e documentação OpenAPI/Swagger para os serviços.

Conceptualmente, a plataforma segue o modelo OAIS. Os recursos são submetidos como SIP, validados por camadas, preservados como AIP e disponibilizados ao consumidor através de DIP gerado a partir do arquivo. A submissão pode ser simples, através da interface, ou avançada, através de um SIP ZIP com `manifest.json`, pasta `data/`, `bagit.txt` opcional e `checksums.txt` opcional.

Como extensão opcional, a plataforma integra um microserviço de IA (`services/ai/`, FastAPI + FAISS + Ollama) com pesquisa semântica, RAG com citações validadas e recomendação pedagógica em duas fases. Os detalhes estão em [`docs/ai-extension/`](docs/ai-extension/).

## Estrutura do projeto

- `plataforma-recursos/` — aplicação completa da plataforma
  - `docker-compose.yml` — orquestração dos serviços
  - `infra/nginx/` — ponto de entrada público
  - `services/` — serviços da plataforma (`gateway`, `auth`, `api`, `interface` e `ai`)
  - `data/povoamento/` — fixtures, inicialização MongoDB e script de povoamento
  - `data/ai-fixtures/` — corpus, consultas anotadas e julgamentos para a extensão de IA
  - `data/aip/` — diretório de preservação dos pacotes AIP
  - `.env.example` — exemplo de configuração de ambiente
- `.github/workflows/` — CI (`ci.yml` com actionlint, zizmor, testes e builds Docker) e CD (`publish.yml`, publicação no GHCR)
- `docs/ai-extension/` — arquitetura, segurança, avaliação experimental e dossiê de evidências da extensão de IA

## Pré-requisitos

- Docker
- Docker Compose v2 (`docker compose`)
- Python 3 e `pip` (apenas para o script de povoamento)

Verificação rápida:

```bash
docker --version
docker compose version
python3 --version
```

## Execução

Preparação inicial:

```bash
cd plataforma-recursos
cp .env.example .env
openssl rand -hex 32   # gerar segredos fortes para preencher o .env
```

Levantar, verificar e abrir:

```bash
docker compose up -d --build
docker compose ps
# browser: http://localhost:16020
```

Parar a stack:

```bash
docker compose down
```

## Documentação Swagger

Com a stack a correr:

- `http://localhost:16020/docs`
- `http://localhost:16020/api/docs`
- `http://localhost:16020/auth/docs`
- `http://localhost:16020/interface/docs`

## Povoamento de recursos

O script aceita apenas `--token` e usa convenções fixas: URL `http://localhost:16020`, metadados em `metadata.csv`, tipo por omissão `artigo` e visibilidade por omissão `publico`.

```bash
pip install -r data/povoamento/requirements.txt
```

Obter um token JWT (resposta devolve campo `token`):

```bash
curl -s -X POST http://localhost:16020/auth/sessions \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin.teste","password":"Admin123"}'
```

Povoar recursos (ou simular primeiro com `--dry-run`):

```bash
python3 data/povoamento/povoamento-recursos.py data/recursos --token <TOKEN>
```

Subconjunto de ficheiros: `--only "ficheiro-a.pdf,recurso-02"`.
