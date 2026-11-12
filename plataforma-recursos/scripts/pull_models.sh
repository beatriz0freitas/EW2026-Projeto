#!/usr/bin/env bash
# Script para download e validação de modelos locais no container Ollama
# Requisito: "Deployment de LLMs locais" (BringTrust / AE2026-0337)

set -euo pipefail

OLLAMA_CONTAINER="${OLLAMA_CONTAINER:-ew2026_ollama}"
LLM_MODEL="${LLM_MODEL:-llama3.2:1b}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-nomic-embed-text}"

echo "=========================================================="
echo "  Inicialização de Modelos Locais - EW2026 Ollama"
echo "  Container: ${OLLAMA_CONTAINER}"
echo "=========================================================="

# Verificar se o container está em execução
if ! docker ps --format '{{.Names}}' | grep -q "^${OLLAMA_CONTAINER}$"; then
  echo "Erro: O container '${OLLAMA_CONTAINER}' não está em execução."
  echo "Execute primeiro: docker compose up -d ollama"
  exit 1
fi

echo "[1/2] Descarregando modelo de embeddings (${EMBEDDING_MODEL})..."
docker exec -i "${OLLAMA_CONTAINER}" ollama pull "${EMBEDDING_MODEL}"

echo "[2/2] Descarregando modelo LLM de instruções (${LLM_MODEL})..."
docker exec -i "${OLLAMA_CONTAINER}" ollama pull "${LLM_MODEL}"

echo ""
echo "=== Modelos registados no Ollama ==="
docker exec -i "${OLLAMA_CONTAINER}" ollama list

echo ""
echo "Sucesso: Todos os modelos locais foram descarregados e estão disponíveis."
