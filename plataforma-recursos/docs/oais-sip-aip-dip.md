# Fluxo OAIS: SIP, AIP e DIP

> Atualizado em: 2026-05-04
>
> Este documento descreve o formato atual e único usado pela plataforma para submissão, arquivo e download de recursos.

## Resumo

```text
Produtor submete ZIP (SIP)
    ↓
Sistema valida estrutura, metadados, segurança e consistência
    ↓
Se OK: cria Resource + Aip, guarda AIP em disco e regista rastreabilidade no MongoDB
Se erro: devolve relatório de validação
    ↓
Consumidor/produtor/admin descarrega DIP gerado a partir do AIP
```

O SIP é o pacote submetido pelo produtor. O AIP é o pacote arquivístico persistido pelo sistema. O DIP é o pacote entregue no download, construído a partir do AIP guardado.

## Estrutura do SIP

O SIP é sempre um ZIP. O formato antigo com `data/metadata.json` e `manifest-sha256.txt` não é aceite.

```text
meu-recurso.zip
├── manifest.json
├── bagit.txt
├── checksums.txt
└── data/
    ├── ficheiro-principal.pdf
    └── anexo.txt
```

Ficheiros esperados:

- `manifest.json`: obrigatório; contém os metadados e a lista de ficheiros.
- `data/`: obrigatório; contém os ficheiros reais do recurso.
- `bagit.txt`: opcional; marcador de conformidade BagIt simplificada.
- `checksums.txt`: opcional; checksums SHA-256 dos ficheiros.

Na raiz do ZIP só são permitidos `manifest.json`, `bagit.txt`, `checksums.txt` e a pasta `data/`.

## Manifesto

Exemplo de `manifest.json`:

```json
{
  "titulo": "Teste AIP DIP",
  "subtitulo": "Exemplo de submissão",
  "tipo": "artigo",
  "hashtags": ["web", "programacao"],
  "visibilidade": "publico",
  "dataCriacao": "2026-03-01",
  "descricao": "Descrição do recurso",
  "files": [
    {
      "name": "ficheiro-principal.pdf",
      "size": 2048000,
      "type": "application/pdf",
      "required": true
    },
    {
      "name": "anexo.txt",
      "size": 5000,
      "type": "text/plain",
      "required": false
    }
  ]
}
```

Campos principais:

- `titulo`: obrigatório.
- `tipo`: obrigatório; valores aceites: `artigo`, `tese`, `slides`, `teste`, `relatorio`, `aplicacao`, `problema`, `outro`.
- `visibilidade`: `publico` ou `privado`; se faltar, assume `publico`.
- `hashtags`: array; se vier como string separada por vírgulas na submissão simples, é convertido.
- `dataCriacao`: opcional; data válida.
- `files`: lista dos ficheiros esperados dentro de `data/`.

Formato de `checksums.txt`:

```text
<sha256>  data/ficheiro-principal.pdf
<sha256>  data/anexo.txt
```

## Validações

### Estrutura

- O ficheiro recebido tem de ser ZIP válido.
- `manifest.json` tem de existir na raiz.
- `data/` tem de existir.
- Os ficheiros indicados em `manifest.json.files` têm de existir em `data/`.
- Ficheiros não declarados em `data/` são sinalizados como aviso.
- Ficheiros de raiz fora da lista permitida são rejeitados.

### Metadados

- `titulo` e `tipo` são obrigatórios.
- `tipo` tem de estar na enumeração permitida.
- `visibilidade` tem de ser `publico` ou `privado`.
- Datas têm de ser válidas.
- `hashtags` tem de ser normalizado para array.
- O formato interno guardado no recurso é sempre:

```json
{
  "resource": {
    "titulo": "Teste AIP DIP",
    "tipo": "artigo",
    "visibilidade": "publico"
  }
}
```

### Segurança

- Proteção contra zip-slip: caminhos com `../`, absolutos ou maliciosos são rejeitados.
- São aceites apenas extensões permitidas: `.pdf`, `.txt`, `.docx`, `.xlsx`, `.jpg`, `.png`, `.gif`, `.mp4`, `.zip`.
- O ZIP total tem limite de 100 MB.
- Cada ficheiro tem limite de 50 MB.
- Nomes de ficheiros perigosos são rejeitados.

### Consistência

- `manifest.json.files` tem de coincidir com os ficheiros reais em `data/`.
- Se `checksums.txt` existir, cada checksum é validado.
- Se `size` existir no manifesto, é comparado com o tamanho real do ficheiro.

## Criação do AIP

Quando o SIP é válido, a API:

1. Cria um documento em `resources`.
2. Cria um documento em `aips`.
3. Guarda o pacote em disco.
4. Preserva o ZIP original.
5. Devolve os IDs criados.

Estrutura em disco:

```text
data/aip/<resourceId>/
├── bag/
│   ├── manifest.json
│   ├── bagit.txt
│   ├── checksums.txt
│   └── data/
│       ├── ficheiro-principal.pdf
│       └── anexo.txt
└── sip.zip
```

Documento `resources`, simplificado:

```json
{
  "_id": "69f918bba8396b3493466f2d",
  "metadata": {
    "resource": {
      "tipo": "artigo",
      "titulo": "Teste AIP DIP",
      "visibilidade": "publico"
    }
  },
  "aipPath": "/aip/69f918bba8396b3493466f2d",
  "produtor": "id-do-produtor",
  "downloadCount": 0
}
```

Documento `aips`, simplificado:

```json
{
  "sipId": "SIP-2026-1777932475443",
  "recursoId": "69f918bba8396b3493466f2d",
  "status": "ok",
  "validacoes": {
    "estrutura": { "ok": true },
    "metadados": { "ok": true },
    "seguranca": { "ok": true },
    "consistencia": { "ok": true }
  },
  "storageLocal": "/aip/69f918bba8396b3493466f2d",
  "checksumSIP": "sha256-do-zip-original",
  "downloadCount": 0
}
```

## Geração do DIP

O DIP não é o ficheiro submetido devolvido diretamente. No download, a API lê o AIP preservado em disco e gera um ZIP de disseminação.

```text
GET /api/oais/access/:resourceId
    ↓
verifica recurso e permissões
    ↓
lê data/aip/<resourceId>/
    ↓
gera DIP-<resourceId>.zip
    ↓
incrementa downloadCount em resources e aips
```

O ZIP do DIP contém o conteúdo arquivístico disponível no AIP:

```text
DIP-<resourceId>.zip
├── bag/
│   ├── manifest.json
│   ├── bagit.txt
│   ├── checksums.txt
│   └── data/
│       └── ...
└── sip.zip
```

## Rotas da API

### Submeter SIP preparado

```http
POST /api/oais/ingest
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Campo multipart:

- `sip`: ficheiro ZIP.

Permissões:

- `produtor`
- `admin`

Sucesso:

```json
{
  "ok": true,
  "status": "ok",
  "aipId": "SIP-2026-1777932475443",
  "resourceId": "69f918bba8396b3493466f2d",
  "recursoId": "69f918bba8396b3493466f2d",
  "mensagem": "SIP ingerido com sucesso",
  "storageLocal": "/aip/69f918bba8396b3493466f2d"
}
```

Erro de validação:

```json
{
  "code": "INVALID_SIP",
  "message": "Não foi possível ler o ficheiro preparado",
  "categoria": "metadados",
  "erros": [
    "Campo 'titulo' é obrigatório"
  ],
  "validacoes": {
    "estrutura": { "ok": true },
    "metadados": { "ok": false },
    "seguranca": { "ok": true },
    "consistencia": { "ok": true }
  }
}
```

### Submissão simples

```http
POST /api/oais/ingest/simples
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Campos:

- `ficheiros`: um ou mais ficheiros.
- `titulo`, `tipo`, `visibilidade`, `subtitulo`, `descricao`, `ano`, `tema`, `hashtags`, `dataCriacao`.

Este endpoint constrói automaticamente um SIP no formato atual e chama o mesmo ingest usado pelo ZIP preparado.

### Descarregar DIP

```http
GET /api/oais/access/:resourceId
```

Permissões:

- Recurso `publico`: qualquer utilizador.
- Recurso `privado`: produtor dono ou admin.

Resposta:

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="DIP-<resourceId>.zip"`

### Consultar, editar e remover recursos

```http
GET /api/resources
GET /api/resources/:id
PATCH /api/resources/:id
DELETE /api/resources/:id
```

Ao editar, o payload tem de respeitar o formato interno:

```json
{
  "metadata": {
    "resource": {
      "titulo": "Novo título",
      "tipo": "artigo",
      "visibilidade": "publico"
    }
  }
}
```

Ao remover, a API elimina:

- o documento `Resource`;
- os documentos `Aip` associados;
- ratings do recurso;
- posts do recurso;
- comentários desses posts;
- a pasta `data/aip/<resourceId>/` em disco.

## Rotas da interface

```text
GET  /resources/new           formulário de submissão
POST /resources/new/simple    submissão simples
POST /resources/new           upload de SIP ZIP preparado
GET  /resources/:id           detalhe
GET  /resources/:id/dip       download do DIP
GET  /resources/:id/edit      formulário de edição
POST /resources/:id/edit      edição dos metadados
POST /resources/:id/delete    remoção do recurso
```

## Código principal

- `services/api/oais/ingest/sip.js`: validação por camadas e criação de AIP.
- `services/api/oais/ingest/pacoteSimples.js`: construção automática de SIP na submissão simples.
- `services/api/oais/ingest/index.js`: rotas de ingestão.
- `services/api/oais/access/dip.js`: geração do ZIP DIP a partir do AIP.
- `services/api/oais/access/index.js`: rota de download e incremento de contadores.
- `services/api/controllers/resourcesController.js`: listar, consultar, editar e remover recursos.
- `services/api/models/Aip.js`: rastreabilidade do AIP.
- `services/api/models/Resource.js`: recurso pesquisável e ligação ao AIP em disco.

