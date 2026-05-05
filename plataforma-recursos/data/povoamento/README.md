
# Povoamento da plataforma

```bash
pip install -r requirements.txt
```

---

## Utilizadores

```bash
python3 povoamento-users.py \
  --input fixtures.json \
  --admin-username admin.teste --admin-password Admin123 \
  --default-password Demo123
```

---

## Recursos

```bash
# Ingerir
python3 povoamento-recursos.py data/recursos --token <TOKEN>

# Simular sem enviar
python3 povoamento-recursos.py data/recursos --token <TOKEN> --dry-run

# Verificar o que foi ingerido
python3 povoamento-recursos.py data/recursos --token <TOKEN> --verify

# Ver duplicados (dry-run)
python3 povoamento-recursos.py data/recursos --token <TOKEN> --cleanup

# Apagar duplicados
python3 povoamento-recursos.py data/recursos --token <TOKEN> --cleanup --apply
```

### Estrutura do input_dir

```
data/recursos/
  ficheiro-a.pdf       ← cada ficheiro é um recurso
  ficheiro-b.pdf

# ou

data/recursos/
  recurso-01/          ← cada subpasta é um recurso
    artigo.pdf
    suplemento.docx
  recurso-02/
    tese.pdf
```

### Metadados opcionais (metadata.csv)

Colocar na raiz do `input_dir`. O campo `key` é o nome do ficheiro ou subpasta.

```csv
key,titulo,tipo,visibilidade,tema,ano,hashtags
ficheiro-a.pdf,Título Personalizado,artigo,publico,Ciência,2024,ia
```

### Opções principais

| Flag                    | Efeito                                                  |
| ----------------------- | ------------------------------------------------------- |
| `--tipo`              | Tipo por omissão (`artigo`,`tese`,`slides`, …)  |
| `--visibilidade`      | `publico`ou `privado`                               |
| `--only a,b`          | Processar apenas esses items                            |
| `--allow-duplicates`  | Não ignora recursos já existentes                     |
| `--sip-mode`          | Envia como SIP ZIP (requer `manifest.json`+`data/`) |
| `--verify`            | Verifica quais recursos locais já estão na plataforma |
| `--cleanup [--apply]` | Remove duplicados (dry-run sem `--apply`)             |
