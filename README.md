# EW2026 

## 1) Pré-requisitos

Instalar:

- Docker
- Docker Compose (v2)

---

## 2) Arranque passo a passo

### Passo 1 — entrar na pasta certa

```bash
cd plataforma-recursos
```

### Passo 2 — criar o ficheiro `.env`

Opção recomendada:

```bash
make init
```

Isto cria `.env` a partir de `.env.example` (sem sobrescrever se já existir).

### Passo 3 — confirmar/ajustar `JWT_SECRET`

No `.env`, garantir que existe:

```env
JWT_SECRET=algum-segredo-local-forte
```

correr  `openssl rand -hex 32` no terminal para gerar string longa

### Passo 4 — subir os serviços

```bash
make up
```

### Passo 5 — abrir a aplicação

No browser:

`http://localhost:16020`

---

## 3) Comandos do dia a dia

```bash
make logs     # ver logs
make ps       # ver estado dos containers
make restart  # reiniciar tudo
make down     # parar tudo
```

---

## 4) Portas usadas

- App (Gateway): `16020`
- API: `16025`
- Interface: `16026`
- Auth: `16027`
