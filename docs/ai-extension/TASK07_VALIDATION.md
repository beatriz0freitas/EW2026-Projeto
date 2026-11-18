# TASK-07 — validação do serviço FastAPI

Verificação local concluída em 12/11/2026. O scaffolding já estava no commit
`1f2cf25`; esta revisão confirma os critérios operacionais sem criar commits.

| Critério | Evidência |
| --- | --- |
| Runtime FastAPI/Uvicorn | Imagem runtime construída e processo HTTP real iniciado como UID 10001 |
| Configuração e contratos | Pydantic estrito, limites de query/topK/IDs, token obrigatório no arranque |
| Autenticação interna | `/health` sem token → 401; token incorreto → 403; token válido → diagnóstico |
| Ollama/modelos disponíveis | HTTP 200 real: `llama3.2:1b` e `nomic-embed-text` instalados, ambos inicialmente descarregados da memória |
| Indisponibilidade | HTTP 503 real com `OLLAMA_UNAVAILABLE` ao apontar para uma porta local sem servidor |
| Independência de liveness | `/live` manteve HTTP 200 durante a falha do Ollama |
| Cliente HTTP | Testes de timeout, retries limitados, redirecionamentos, respostas inválidas e erros sanitizados |
| Verificação automatizada | Testes de configuração, contratos, autenticação e falhas aprovados; Ruff/Bandit sem ocorrências |

Ambiente observado: Python 3.11.18, FAISS 1.16.0 e Ollama 0.6.0 (imagem já
existente na máquina). Foram usados contentores de validação sem portas
publicadas, token descartável e os modelos locais reais. O Compose continua
com a tag Ollama `latest`; não se afirma que todas as versões futuras estão
validadas. Não se executou publicação nem GitHub Actions remotamente.

As dependências diretas estão fixadas; isso não equivale a um lockfile completo
das dependências transitivas. `scikit-learn` não é necessário para o scaffolding
nem para usar FAISS diretamente. pytest/Ruff/Bandit ficam na imagem de testes.
O TestClient emite um aviso de depreciação da integração httpx; os testes passam.

## Reproduzir o diagnóstico

A partir de `plataforma-recursos/`, com `.env` local configurado:

```bash
docker compose up -d --build ollama ai
bash scripts/pull_models.sh
docker compose exec -T ai python - <<'PY'
import os
import requests

url = 'http://127.0.0.1:8000'
assert requests.get(url + '/live', timeout=2).status_code == 200
assert requests.get(url + '/health', timeout=2).status_code == 401
assert requests.get(url + '/health', headers={'X-Internal-Token': 'invalid'}, timeout=2).status_code == 403
response = requests.get(url + '/health', timeout=35,
                        headers={'X-Internal-Token': os.environ['INTERNAL_SERVICE_TOKEN']})
response.raise_for_status()
print(response.json())
PY
```

O segredo é obtido dentro do contentor e não é impresso. O diagnóstico não faz
pull nem inferência. A distinção entre modelos instalados e carregados segue
as APIs oficiais [`/api/tags`](https://docs.ollama.com/api/tags) e
[`/api/ps`](https://docs.ollama.com/api/ps). Um HTTP 200 deste endpoint comprova
o diagnóstico dos modelos, não a geração de respostas RAG; essa funcionalidade
pertence a tarefas posteriores.
