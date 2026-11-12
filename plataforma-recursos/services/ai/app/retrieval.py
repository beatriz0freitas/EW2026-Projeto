"""ACL-safe semantic retrieval over the published FAISS generation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

import faiss
import numpy as np

from app.indexer import load_generation
from app.schemas import SearchItem, SearchResponse


class QueryEmbeddingProvider(Protocol):
    def __call__(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per query."""


class FaissRetriever:
    """Search only the resources explicitly authorized by the caller."""

    def __init__(
        self,
        index_path: Path,
        embedder: QueryEmbeddingProvider,
    ) -> None:
        self.index_path = Path(index_path)
        self.embedder = embedder

    def search(self, query: str, allowed_ids: list[str], top_k: int) -> SearchResponse:
        if not allowed_ids:
            return SearchResponse(items=[], indexVersion="none")
        if top_k < 1:
            raise ValueError("top_k must be positive")
        index, manifest = load_generation(self.index_path)
        items = manifest["items"]
        allowed = set(allowed_ids)
        selected = [
            item for item in items
            if item["resourceId"] in allowed
        ]
        if not selected:
            return SearchResponse(items=[], indexVersion=manifest["version"])
        positions = [item["vectorIndex"] for item in selected]
        vectors = np.ascontiguousarray(
            np.vstack([index.reconstruct(position) for position in positions]),
            dtype=np.float32,
        )
        query_vector = _normalise_query(self.embedder([query]))
        authorized_index = faiss.IndexFlatIP(index.d)
        authorized_index.add(vectors)
        scores, result_positions = authorized_index.search(
            query_vector, min(top_k, len(selected))
        )
        results = [
            SearchItem(
                resourceId=selected[position]["resourceId"],
                chunkId=selected[position]["chunkId"],
                score=float(score),
                title=selected[position]["title"],
                theme=selected[position]["theme"],
                excerpt=_excerpt(selected[position]),
            )
            for score, position in zip(scores[0], result_positions[0], strict=True)
            if position >= 0
        ]
        return SearchResponse(items=results, indexVersion=manifest["version"])


def _normalise_query(embeddings: list[list[float]]) -> np.ndarray:
    if len(embeddings) != 1:
        raise ValueError("query embedding provider must return one vector")
    matrix = np.asarray(embeddings, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] != 1 or not np.isfinite(matrix).all():
        raise ValueError("query embedding is invalid")
    norm = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norm <= 0):
        raise ValueError("query embedding must not be zero")
    return np.ascontiguousarray(matrix / norm, dtype=np.float32)


def _excerpt(item: dict[str, Any]) -> str:
    try:
        text = json.loads(item["text"])
        excerpt = text["descricao"]
    except (KeyError, TypeError, json.JSONDecodeError):
        raise RuntimeError("published manifest contains invalid resource text") from None
    if not isinstance(excerpt, str) or not excerpt.strip():
        raise RuntimeError("published manifest contains invalid resource excerpt")
    return excerpt
