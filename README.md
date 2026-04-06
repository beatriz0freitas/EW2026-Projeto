# EW2026 — Plataforma de Gestão e Disponibilização de Recursos Educativos

Fluxo geral:

Cliente → Gateway → (Interface / API / Auth) → MongoDB + Storage AIP

---

## Pré-requisitos

Necessário ter instalado:

- Docker
- Docker Compose v2 (`docker compose`)
- `make` (opcional, mas recomendado para comandos rápidos)

Verificação rápida:

```bash
docker --version
docker compose version
make --version
```

---

## Execução

### Passo 1 — entrar na pasta da aplicação

```bash
cd plataforma-recursos
```

### Passo 2 — criar `.env`

```bash
make init
```

Isto cria `.env` a partir de `.env.example` se ainda não existir.

### Passo 3 — definir segredo JWT

No ficheiro `.env`, garantir um valor seguro para:

```env
JWT_SECRET=coloca-aqui-um-segredo-forte
JWT_EXPIRES=24h
```

Gerar segredo recomendado via terminal:

```bash
openssl rand -hex 32
```

### Passo 4 — levantar os serviços

```bash
make up
```

### Passo 5 — abrir a aplicação

Abrir no browser:

`http://localhost:16020`

---

## Portas e endpoints principais

Portas internas da solução:

- Gateway: `16020` (exposta ao host)
- API: `16025`
- Interface: `16026`
- Auth: `16027`

---

## 8) Funcionalidades já disponíveis

### Auth

- Registo público (`/auth/register`)
- Login JWT (`/auth/sessions`)
- Verificação de token (`/auth/sessions/verify`)
- Perfil autenticado (`/auth/me`)
- Gestão de utilizadores para admin (`/auth/users`)

### API

- Recursos (listar, detalhe, editar/apagar com posse/perfil)
- Posts e comentários
- Ratings (1 por utilizador/recurso)
- Notícias
- Taxonomia
- OAIS ingest (`POST /api/oais/ingest`) e access (`GET /api/oais/access/:id`)

### Interface

- Login / registo / logout
- Página inicial com notícias
- Listagem e detalhe de recursos
- Submissão de recursos via SIP (produtor/admin)
- Download de recursos via DIP (públicos e privados com autorização)
- Classificação de recursos
- Listagem/criação/detalhe de posts
- Comentários em posts
- Área de administração (utilizadores e notícias)

**Nota:** as páginas web de autenticação são servidas pela Interface em `/auth/login` e `/auth/register`.
Os endpoints JSON do serviço Auth continuam em `/auth/sessions`, `/auth/sessions/verify`, etc.
