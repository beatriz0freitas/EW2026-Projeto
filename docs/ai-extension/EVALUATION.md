# Avaliação experimental (TASK-15)

## Objetivo e configuração da execução

O benchmark compara três abordagens nas 15 consultas anotadas do corpus TASK-06: pesquisa lexical em título/tema/hashtags, similaridade vetorial FAISS e candidatos FAISS reordenados pelo recomendador com LLM local. O corpus contém 21 recursos públicos e 4 privados; apenas os públicos participam na recuperação. O script cria o índice numa pasta temporária e não altera o índice operacional.

Execução efetuada em Linux x86_64, Python 3.14.7, 8 CPUs lógicas e 7,4 GiB de RAM (hardware descrito em [BASELINE.md](BASELINE.md)). O serviço foi Ollama 0.6.0, executado em CPU, com `llama3.2:1b` quantizado Q8_0 e `nomic-embed-text` F16. Os digests foram `llama3.2:1b@baf6a787fdffd633537aa2eb51cfd54cb93ff08e28040095462bb63daf552878` e `nomic-embed-text@0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`. O limite de geração do serviço foi 60 s. O modelo truncou prompts acima do contexto de 2048 tokens.

## Metodologia

- **Dados:** `plataforma-recursos/data/ai-fixtures/resources.json`, `queries.jsonl` e `judgments.jsonl` (15 queries e anotações graduadas de 0 a 3). Apenas recursos com `visibilidade=publico` entram no índice e na lista de IDs permitidos.
- **Lexical:** normaliza acentos e caixa, tokeniza termos alfanuméricos e soma correspondências por campo: título ×3, tema ×2, hashtags ×1. Empates seguem a ordem do corpus. É uma baseline lexical simples e determinística, sem stemming ou remoção de stopwords.
- **Vetorial:** embeddings do modelo `EMBEDDING_MODEL` através de Ollama; índice FAISS de produto interno sobre vetores L2 normalizados, com filtragem ACL do `FaissRetriever`. A latência inclui embedding da query e pesquisa FAISS.
- **Reranking:** `RecommenderEngine` existente, com 15 candidatos FAISS, top 5 e o modelo local. A latência inclui embedding, recuperação, geração e validação. O limite de 60 s é o limite por omissão do serviço.
- **Métricas:** Precision@5 conta anotações com relevância >0 e divide por 5; nDCG@5 usa ganho `2^rel−1`, desconto `log2(rank+1)` e os julgamentos disponíveis como ideal. Recursos sem julgamento explícito recebem relevância 0. Média, p50 e p95 são calculados sobre todas as latências medidas, incluindo fallbacks e timeouts. JSON válido exige um objeto JSON com uma lista `recommendations`. Conformidade de citações exige que a recomendação produzida pelo LLM tenha IDs e chunks presentes nos candidatos; falhas e fallbacks contam como não conformes para esta taxa.
- **Reprodutibilidade:** as medições de latência são locais, sensíveis à máquina, carga e estado térmico, e não devem ser comparadas entre hosts sem controlar o ambiente. O CSV contém uma linha por query/método e o estado real da chamada.

## Resultados medidos

| Método | Queries executadas | Precision@5 média | nDCG@5 média | Latência média (ms) | p50 (ms) | p95 (ms) | Citações conformes | JSON válido |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Lexical | 15/15 | 0,3333 | 0,7674 | 0,335 | 0,304 | 0,861 | n/a | n/a |
| Vetorial FAISS | 15/15 | 0,4400 | 0,8073 | 1 285,112 | 1 318,976 | 3 397,658 | n/a | n/a |
| FAISS + reranking LLM | 15/15; 0/15 rerank aceites | n/a | n/a | 59 191,061 | 60 262,678 | 61 001,509 | 0/15 | 1/15 |

O método vetorial melhorou a Precision@5 em 0,1067 e o nDCG@5 em 0,0399 face à baseline lexical neste corpus. As 15 chamadas de reranking foram realmente tentadas: 14 atingiram o timeout de 60 s; uma produziu JSON sintaticamente válido, mas o recomendador rejeitou a resposta e usou fallback semântico. Assim, não há ranking LLM aceite para calcular Precision@5/nDCG@5. O JSON válido foi 1/15 e nenhuma resposta LLM aceite cumpriu as citações. As latências da coluna LLM incluem o fallback/timeout e estão detalhadas query a query no CSV.

Os tempos lexicais medem a função de ordenação com `time.perf_counter()`; não incluem leitura dos fixtures ou escrita do relatório. As medições FAISS incluem a chamada de embedding local. O método LLM inclui a geração, cujo timeout observado mostra que o modelo 1B em CPU não termina de forma fiável dentro do limite operacional de 60 s.

## Análise e ameaças à validade

A baseline lexical pode ter nDCG@5 superior à Precision@5 porque o nDCG considera o grau de relevância, enquanto a precisão conta relevância como acerto/não acerto. Neste conjunto, o método vetorial superou a baseline lexical nas duas métricas. A coleção é pequena, sintética, temática e foi anotada para estas consultas; os resultados não estimam qualidade em recursos ou necessidades de aprendizagem reais. O peso lexical foi definido como baseline explícita e não ajustado por validação. As 15 queries também constituem uma amostra pequena.

O reranking LLM não pôde ser comparado por qualidade porque nenhuma resposta foi aceite. A taxa elevada de timeout e o truncamento de prompts indicam que a configuração de CPU/contexto atual não suporta este reranking com fiabilidade. A única resposta JSON sintaticamente válida também foi rejeitada pelo validador do recomendador. Isto demonstra uma limitação operacional, não evidência de que o reranking melhora ou piora a relevância. A query fora de domínio Q15 avalia abstenção nos testes de RAG, mas não é um julgamento de recomendação.

## Re-execução com pool de reranking reduzido

Após a execução inicial, o `RecommenderEngine` passou a submeter ao LLM apenas os primeiros 5 candidatos FAISS (novo parâmetro `rerank_pool_size`, omissão 5) com excertos truncados a 200 carateres e `num_predict=512`, mantendo o resto do pool para o fallback semântico. O prompt degrava do limite de 2048 tokens do `llama3.2:1b` e reduz o custo de pre-fill em CPU. A validação de citações não foi afetada: continua a rejeitar respostas com chunkIds fora dos candidatos.

O benchmark foi repetido no mesmo corpus (15 consultas), Ollama 0.6.0 em CPU com os mesmos digests dos modelos (`llama3.2:1b@baf6a787fdff…`, `nomic-embed-text@0a109f422b47…`), Python 3.14.7, 8 CPUs lógicas, ~7 GiB de RAM, com `OLLAMA_GENERATION_TIMEOUT_SECONDS=120` no ambiente de medição (nenhuma geração excedeu 45 s, portanto o timeout de 60 s por omissão do serviço teria igualmente bastado nesta amostra).

| Método | Queries executadas | Precision@5 média | nDCG@5 média | Latência média (ms) | p50 (ms) | p95 (ms) | JSON válido |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lexical | 15/15 | 0,3333 | 0,7674 | 0,657 | 0,551 | 2,061 | n/a |
| Vetorial FAISS | 15/15 | 0,4400 | 0,8073 | 88,793 | 80,889 | 163,185 | n/a |
| FAISS + reranking LLM | **3/15 rerank aceites** | 0,4667 (nas 3 aceites) | 0,6495 (nas 3 aceites) | 35 515 | 37 210 | 44 780 | 10/15 |

Leitura honesta dos resultados:

- **Zero timeouts na fase LLM** (antes 14/15): o gargalo operacional estava no tamanho do prompt, não no modelo em si. 3/15 respostas superaram a validação completa (Q01 com Precision@5 0,8 e nDCG@5 0,588; Q03; Q11) — é a primeira evidência de reordenação LLM aceite neste projeto, embora a taxa de aceitação continue baixa.
- **0/15 → 3/15 aceites**, com a qualidade medida sobre apenas 3 respostas: a comparação direta das médias com os métodos de recuperação completa não é estatisticamente significativa e não deve ser apresentada como vitória do LLM.
- Os restantes 12 casos degradaram para `semantic_fallback`: 7 com JSON sintaticamente válido rejeitado pelo validador (quase sempre `supportingChunkIds` divergente do chunk exato do candidato — o validador de citações de TASK-14 a funcionar como previsto) e 5 com JSON inválido. A opção deliberada foi manter a validação estrita e aceitar a queda de aceitação, em vez de afrouxar o sistema de não-invenção de citações.
- A latência p95 de ~45 s confirma que o reranking por LLM 1B em CPU permanece marginalmente viável em tempo real; o fallback semântico cobre o resto: latência e disponibilidade sacrificam-se à determinismo dos dados, nunca o contrário.

## Repetir o benchmark

Com Ollama acessível e os modelos já instalados (o script não descarrega modelos). Para o contentor usado nesta execução, o endereço foi `http://172.17.0.2:11434`; confirma o IP atual com `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ew2026-task-validation-ollama`.

```bash
cd plataforma-recursos
OLLAMA_BASE_URL=http://172.17.0.2:11434 \
OLLAMA_GENERATION_TIMEOUT_SECONDS=60 \
LLM_MODEL=llama3.2:1b \
EMBEDDING_MODEL=nomic-embed-text \
python3 services/ai/evaluation/evaluate.py
```

O comando reescreve `docs/ai-extension/EXPERIMENTS.csv` com uma linha por query e método e imprime as médias, p50 e p95. A configuração atual do recomendador submete top 5 candidatos ao LLM (`rerank_pool_size=5`); os resultados desatualizados de cada execução ficam no histórico do git. A taxa de aceitação do reranking é reportada tal como medida e não deve ser confundida com uma medida de qualidade do ranking LLM.
