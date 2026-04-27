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

## Como consultar o Swagger

Com os serviços levantados, a documentação Swagger fica acessível via Gateway:

- Hub (seleção de serviço): `http://localhost:16020/docs`
- Gateway: `http://localhost:16020/gateway/docs`
- API: `http://localhost:16020/api/docs`
- Auth: `http://localhost:16020/auth/docs`
- Interface: `http://localhost:16020/interface/docs`

Notas:

- Em endpoints protegidos, usar token Bearer válido na UI do Swagger.
- Aceder sempre pelos URLs do Gateway para manter o mesmo fluxo da arquitetura.

---

## Portas dos serviços

- Gateway: `16020` (porta pública)
- API: `16025`
- Interface: `16026`
- Auth: `16027`
