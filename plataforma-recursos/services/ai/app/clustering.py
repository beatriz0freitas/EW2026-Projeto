"""Deterministic thematic clustering over the published FAISS generation."""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any

import faiss
import numpy as np

from app.indexer import load_generation
from app.schemas import Cluster

TOKEN_PATTERN = re.compile(r"[^\W_]+(?:[-'][^\W_]+)*", re.UNICODE)
STOPWORDS = {
    "a", "ao", "as", "com", "da", "das", "de", "do", "dos", "e", "em",
    "para", "por", "que", "um", "uma", "os", "na", "no", "nas", "nos",
}


class FaissClusterEngine:
    """Cluster authorized resources using FAISS spherical k-means."""

    def __init__(self, index_path: Path, seed: int = 2026) -> None:
        self.index_path = Path(index_path)
        self.seed = seed

    def cluster(self, allowed_ids: list[str], n_clusters: int) -> list[Cluster]:
        if not allowed_ids:
            return []
        if n_clusters < 1:
            raise ValueError("n_clusters must be positive")
        index, items = self._load_generation()
        positions_by_id = {item["resourceId"]: position for position, item in enumerate(items)}
        selected_ids = [
            resource_id for resource_id in allowed_ids if resource_id in positions_by_id
        ]
        if not selected_ids:
            return []
        positions = [positions_by_id[resource_id] for resource_id in selected_ids]
        vectors = np.vstack([index.reconstruct(position) for position in positions])
        cluster_count = min(n_clusters, len(selected_ids))
        if cluster_count == 1:
            assignments = np.zeros(len(selected_ids), dtype=np.int64)
            centroids = np.mean(vectors, axis=0, keepdims=True)
            centroids = _normalise(centroids)
        else:
            assignments, centroids = self._fit(vectors, cluster_count)
        result: list[Cluster] = []
        for cluster_id in range(cluster_count):
            member_indexes = np.flatnonzero(assignments == cluster_id).tolist()
            if not member_indexes:
                continue
            member_items = [items[positions[position]] for position in member_indexes]
            result.append(
                Cluster(
                    clusterId=cluster_id,
                    resourceIds=[item["resourceId"] for item in member_items],
                    keywords=_keywords(member_items),
                    centroid=centroids[cluster_id].tolist(),
                )
            )
        return result

    def _fit(self, vectors: np.ndarray, cluster_count: int) -> tuple[np.ndarray, np.ndarray]:
        dimension = vectors.shape[1]
        clustering = faiss.Clustering(dimension, cluster_count)
        clustering.niter = 25
        clustering.nredo = 1
        clustering.seed = self.seed
        clustering.spherical = True
        assignment_index = faiss.IndexFlatIP(dimension)
        clustering.train(np.ascontiguousarray(vectors, dtype=np.float32), assignment_index)
        centroids = _normalise(
            faiss.vector_to_array(clustering.centroids).reshape(cluster_count, dimension)
        )
        centroid_index = faiss.IndexFlatIP(dimension)
        centroid_index.add(centroids)
        assignments = centroid_index.search(
            np.ascontiguousarray(vectors, dtype=np.float32), 1
        )[1].reshape(-1)
        return assignments, centroids

    def _load_generation(self) -> tuple[faiss.Index, list[dict[str, Any]]]:
        index, manifest = load_generation(self.index_path)
        return index, manifest["items"]


def _normalise(vectors: np.ndarray) -> np.ndarray:
    vectors = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if not np.isfinite(vectors).all() or np.any(norms <= 0):
        raise RuntimeError("FAISS produced invalid cluster vectors")
    return np.ascontiguousarray(vectors / norms, dtype=np.float32)


def _keywords(items: list[dict[str, Any]], limit: int = 5) -> list[str]:
    words = Counter(
        token.lower()
        for item in items
        for field in ("title", "theme")
        for token in TOKEN_PATTERN.findall(str(item.get(field, "")))
        if token.lower() not in STOPWORDS and len(token) > 2
    )
    return [word for word, _ in words.most_common(limit)]
