# Submissao de recursos

## Via interface

Produtores e administradores podem criar recursos em `/resources/new`.

Existem dois modos:

- submissao simples: o utilizador preenche metadados e anexa ficheiros; a API gera automaticamente o SIP BagIt;
- SIP avancado: o utilizador submete diretamente um ZIP SIP ja preparado.

Nos dois casos, o backend executa o mesmo fluxo OAIS:

```text
submissao -> SIP -> validacao -> AIP -> DIP
```

## Via pasta local

Para preparar recursos a partir do codigo ou de um dataset local, criar uma pasta com:

```text
recursos/meu-recurso/
├── metadados.json
└── ficheiros/
    ├── recurso.pdf
    └── dados.json
```

Exemplo de `metadados.json`:

```json
{
  "resource": {
    "tipo": "dataset",
    "titulo": "Dataset de exemplo",
    "visibilidade": "publico",
    "tema": "dados",
    "hashtags": ["exemplo", "dataset"]
  }
}
```

Gerar apenas o SIP:

```bash
node scripts/submeter-recurso.js recursos/meu-recurso
```

Gerar e submeter na API:

```bash
API_TOKEN=<token-produtor> API_URL=http://localhost:16025/api node scripts/submeter-recurso.js recursos/meu-recurso
```

O script escreve um relatorio em `output/reports/report.json`.
