# EW2026 - Plataforma de Recursos

Projeto de gestão e disponibilização de recursos educativos com arquitetura composta por `gateway`, `interface`, `api`, `auth`, `mongodb` e storage AIP em disco.

---

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
cd EW2026-Projeto/plataforma-recursos
```

Criar o ficheiro `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Gerar segredos fortes para preencher o `.env`:

```bash
openssl rand -hex 32
```

Preencher pelo menos estas variáveis:

```env
JWT_SECRET=<valor-1>
JWT_REFRESH_SECRET=<valor-2>
SESSION_SECRET=<valor-3>
INTERNAL_SERVICE_TOKEN=<valor-4>
```

Para que serve cada valor:

- `JWT_SECRET`: assinatura dos access tokens no serviço Auth.
- `JWT_REFRESH_SECRET`: assinatura dos refresh tokens.
- `SESSION_SECRET`: assinatura de sessão no serviço Interface.
- `INTERNAL_SERVICE_TOKEN`: autenticação entre serviços (API <-> Auth) para endpoints internos e notícias automáticas.

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

### 3. Ver logs, se necessário

```bash
docker compose logs -f mongodb api auth interface gateway nginx
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

## Utilizadores de demonstração

Os utilizadores de demonstração são carregados automaticamente pelo MongoDB no arranque inicial, a partir de:

- `data/povoamento/fixtures.json`
- `data/povoamento/init-mongo.js`

Isto acontece apenas quando a coleção `users` ainda está vazia.

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

## Estrutura esperada para `data/recursos`

O script aceita dois formatos.

### Opção A: um ficheiro = um recurso

```text
data/recursos/
  ficha-a.pdf
  ficha-b.pdf
```

### Opção B: uma subpasta = um recurso

```text
data/recursos/
  recurso-01/
    artigo.pdf
    anexo.docx
  recurso-02/
    slides.pdf
```

---

## Metadados opcionais com `metadata.csv`

Se existir um ficheiro `metadata.csv` na raiz do diretório de input, os seus valores são usados por recurso.

Exemplo:

```csv
key,titulo,tipo,visibilidade,tema,ano,hashtags
ficha-a.pdf,Título Personalizado,artigo,publico,Ciência,2024,ia
recurso-01,Slides de Segurança,slides,privado,Segurança,2025,seguranca,aula
```

Notas:

- `key` deve ser o nome do ficheiro ou da subpasta;
- se `titulo` não existir, o script gera o título a partir do nome do item;
- `tipo`, `visibilidade`, `tema`, `ano` e `hashtags` podem ser definidos diretamente no CSV.
- se `tipo` ou `visibilidade` não existirem no CSV, o script usa `artigo` e `publico`.

---

## Swagger

Com a stack a correr, a documentação Swagger fica acessível em:

- `http://localhost:16020/docs`
- `http://localhost:16020/api/docs`
- `http://localhost:16020/auth/docs`
- `http://localhost:16020/interface/docs`

---

**Universidade do Minho | Escola de Engenharia**
