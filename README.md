# EW2026 — Plataforma de Gestão e Disponibilização de Recursos Educativos

Fluxo geral da arquitetura:

Cliente -> Gateway -> (Interface / API / Auth) -> MongoDB + storage AIP em disco

---

## Pré-requisitos

É necessário ter instalado:

- Docker
- Docker Compose v2 (`docker compose`)

Verificação rápida:

```bash
docker --version
docker compose version
```

---

## Configuração do ambiente (.env)

Entrar na pasta do projeto executável:

```bash
cd plataforma-recursos
```

Criar o `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Gerar 3 segredos fortes e diferentes (recomendado):

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Preencher o `.env` com os valores gerados:

```env
JWT_SECRET=<valor-1>
SESSION_SECRET=<valor-2>
INTERNAL_SERVICE_TOKEN=<valor-3>
```

Para que serve cada valor:

- `JWT_SECRET`: assinatura de tokens no serviço Auth.
- `SESSION_SECRET`: assinatura de sessão no serviço Interface.
- `INTERNAL_SERVICE_TOKEN`: autenticação entre serviços (API <-> Auth) para endpoints internos e notícias automáticas.

---

## Como correr o trabalho

Levantar os serviços:

```bash
docker compose up -d --build
```

Ver estado:

```bash
docker compose ps
```

Ver logs:

```bash
docker compose logs -f api auth interface gateway
```

Parar os serviços:

```bash
docker compose down
```

Abrir no browser:

`http://localhost:16020`

---

## Portas dos serviços

- Gateway: `16020` (porta pública)
- API: `16025`
- Interface: `16026`
- Auth: `16027`

---

## Estado funcional atual

### Auth

- Registo público e login JWT
- Refresh token
- Verificação de token
- Perfil autenticado
- Gestão de utilizadores (admin)

### API

- Recursos, posts, comentários, ratings, taxonomia e notícias
- OAIS ingest e access
- Export/import de dados
- Notícias automáticas do sistema com dedupe
- Job diário para top3 e total de utilizadores

### Interface

- Login / registo / logout
- Home com notícias recentes
- Recursos (lista, detalhe, upload SIP, download DIP, rating)
- Posts e comentários
- Administração (utilizadores, notícias, import/export)

Nota:

- Páginas web de auth são servidas pela Interface (`/auth/login`, `/auth/register`).
- Endpoints JSON de auth continuam no serviço Auth (`/auth/sessions`, `/auth/sessions/verify`, etc.).
