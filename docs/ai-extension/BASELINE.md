# Baseline Técnica do Repositório (TASK-01)

**Projeto:** Plataforma de Recursos Educativos (EW2026)\
**Repositório:** `beatriz0freitas/EW2026-Projeto`\
**Branch de trabalho:** `beatriz`\
**Data de auditoria:** 10/11/2026\
**Commit base:** `b9a4784` (`Merge pull request #17 from luis444coelho/katara`)

---

## 1. Ambiente de Execução Auditado

| Ferramenta / Recurso | Versão / Especificação Detetada | Requisito Mínimo Atendido |
| :--- | :--- | :--- |
| **Node.js** | `v24.22.2` (suporta Node 22+ especificado nos Dockerfiles) | Runtime do backend Node.js |
| **npm** | `v11.7.0` (suporta `npm ci` via `package-lock.json` v3) | Instalação determinística no CI |
| **Docker** | `24.0.7` (build 24.0.7-0ubuntu2~22.04.1) | Containerização de serviços |
| **Docker Compose** | `2.40.3` (Compose v2) | Orquestração multi-serviço |
| **Python** | `3.10.12` | Scripts de povoamento e futuro serviço AI |
| **CPU** | Intel Core i7-1165G7 @ 2.80GHz (8 threads) | Capacidade de inferência CPU com modelos quantizados (`1b`/`3b`) |
| **RAM** | 7.4 GiB (Swap: 9.0 GiB) | Adequado para modelo `llama3.2:1b` (consome ~1.3GB RAM) |

---

## 2. Resultado dos Testes de Regressão da API (`services/api`)

Comando executado:
```bash
cd plataforma-recursos/services/api && npm test
```

### Sumário da Execução
- **Total de testes:** 46
- **Testes aprovados (pass):** 46
- **Testes falhados (fail):** 0
- **Duração total:** 677.6 ms
- **Taxa de sucesso:** 100%

### Cobertura de Domínios Testados
1. **Preservação e Armazenamento OAIS/AIP:**
   - Resolução e construção de caminhos AIP (`aipStorage.test.js`)
   - Rejeição de reposição com caminho relativo inseguro (path traversal prevention)
   - Extração e exportação de ficheiros AIP em pasta temporária
   - Construção de metadados do pacote SIP guardado

2. **Geração e Acesso a DIP (Dissemination Information Package):**
   - DIP amigável com metadados e ficheiros de consumo sem ficheiro SIP original (`dip.test.js`)
   - Filtragem de ficheiros selecionados e comportamento por omissão
   - Rota de entrega OAIS com atualização de contadores de download (`oaisAccess.test.js`)

3. **Ingestão OAIS e Validação de Metadados:**
   - Validação de metadados mínimos e visibilidade por omissão pública (`metadataValidator.test.js`)
   - Rejeição de formatos e metadados malformados
   - Submissão simples com estrutura BagIt (`pacoteSimples.test.js`, `oaisIngest.test.js`)

4. **Autenticação, Autorização e Controlo de Acesso (ACL):**
   - Proteção de rotas com exigência de token (`autorizacao.test.js`)
   - Diferenciação de perfis (`consumidor`, `produtor`, `admin`)
   - Regras de visibilidade de recursos públicos vs privados (`resourceAccess.test.js`)
   - Funções nucleares a preservar: `canViewResource`, `visibilityQuery`, `resourceAccessError`

5. **Transferência e Exportação Segura:**
   - Filtros de exportação e permissões de utilizadores (`transferFilters.test.js`, `transferPermissions.test.js`)
   - Criação segura de ficheiros ZIP (`simpleZip.test.js`)

6. **Proteção da Fronteira e Resiliência:**
   - Rate limiting na API (`rateLimitApi.test.js`)
   - Validação de uploads multipart e validação de paginação (`uploadMiddleware.test.js`, `validateMiddleware.test.js`)

---

## 3. Validação da Infraestrutura Docker Compose

Comando executado:
```bash
cd plataforma-recursos && docker compose config --quiet
```
- **Resultado:** Código de saída `0` (sintaxe válida, redes e volumes bem declarados).
- **Serviços declarados:** `nginx`, `mongodb`, `api`, `auth`, `interface`, `gateway`.
- **Rede interna:** `ew2026-net` (bridge).
- **Volumes:** `mongo_data`.
- **Ponto de entrada público:** Porta `16020` (nginx).

---

## 4. Estado das Dependências

- `services/api/package-lock.json` presente, versão do formato `3`, compatível com `npm ci`.
- Instalação limpa via `npm ci` testada e aprovada (137 pacotes auditados).

---

## 5. Garantia de Preservação Arquitetural

As seguintes decisões de projeto ficam formalmente registadas como intocáveis na extensão com IA:
1. **Estrutura OAIS existente:** nenhuma rota SIP/AIP/DIP será alterada ou removida.
2. **Caminhos de ficheiros AIP:** `aipPath` e `aipFile.path` continuam estritamente privados, nunca sendo passados a modelos de linguagem nem expostos no Swagger ou em endpoints públicos.
3. **Controlo de Acesso (ACL):** a função `visibilityQuery(user)` é a fonte única de verdade para definir os recursos autorizados a indexar ou consultar pelo microserviço de IA.
4. **Independência Operacional:** a plataforma base continuará 100% funcional caso o microserviço de IA ou o Ollama estejam indisponíveis (degradação graciosa com HTTP 503 nos endpoints de IA).
