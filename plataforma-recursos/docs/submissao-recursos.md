# Submissao de recursos

> Formato atual: SIP ZIP com `manifest.json` na raiz, pasta `data/`, `bagit.txt` opcional e `checksums.txt` opcional. O formato antigo com `data/metadata.json` e `manifest-sha256.txt` não é aceite.

## Via interface

Produtores e administradores podem criar recursos em `/resources/new`.

Existem dois modos:

- submissao simples: o utilizador preenche metadados e anexa ficheiros; a API gera automaticamente o SIP BagIt;
- SIP avancado: o utilizador submete diretamente um ZIP SIP ja preparado.

Nos dois casos, o backend executa o mesmo fluxo OAIS:

```text
submissao -> SIP -> validacao por camadas -> AIP guardado -> DIP gerado do AIP
```

## Via ZIP preparado

Para preparar um SIP manualmente, criar um ZIP com:

```text
meu-recurso.zip
├── manifest.json
├── bagit.txt
├── checksums.txt
└── data/
    ├── recurso.pdf
    └── notas.txt
```

Exemplo de `manifest.json`:

```json
{
  "titulo": "Dataset de exemplo",
  "tipo": "artigo",
  "visibilidade": "publico",
  "tema": "dados",
  "hashtags": ["exemplo", "dataset"],
  "files": [
    {
      "name": "recurso.pdf",
      "type": "application/pdf",
      "required": true
    },
    {
      "name": "notas.txt",
      "type": "text/plain",
      "required": false
    }
  ]
}
```

Submeter na API:

```bash
curl -X POST http://localhost:16020/api/oais/ingest \
  -H "Authorization: Bearer <token-produtor>" \
  -F "sip=@meu-recurso.zip"
```
