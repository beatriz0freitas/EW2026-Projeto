from pathlib import Path

import faiss
import pytest

from app.clustering import FaissClusterEngine
from app.indexer import FaissIndexer


class VectorEmbedder:
    model_id = "synthetic-clustering@v1"
    def __init__(self, vectors: list[list[float]]) -> None:
        self.vectors = vectors

    def __call__(self, texts: list[str]) -> list[list[float]]:
        return self.vectors[: len(texts)]


def resource(resource_id: str, title: str, theme: str) -> dict:
    return {
        "_id": resource_id,
        "metadata": {
            "resource": {
                "titulo": title,
                "descricao": "Descrição.",
                "tema": theme,
                "hashtags": [],
                "visibilidade": "publico",
            }
        },
    }


IDS = [
    "663e00000000000000000001",
    "663e00000000000000000002",
    "663e00000000000000000003",
    "663e00000000000000000004",
]


def make_engine(tmp_path: Path) -> FaissClusterEngine:
    resources = [
        resource(IDS[0], "Paxos", "distribuídos"),
        resource(IDS[1], "Raft", "distribuídos"),
        resource(IDS[2], "TLS", "redes"),
        resource(IDS[3], "QUIC", "redes"),
    ]
    vectors = [[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [0.1, 0.9]]
    FaissIndexer(tmp_path, VectorEmbedder(vectors)).build(resources)
    return FaissClusterEngine(tmp_path)


def test_clusters_synthetic_vectors_and_returns_centroids(tmp_path: Path):
    clusters = make_engine(tmp_path).cluster(IDS, 2)
    assert len(clusters) == 2
    clustered_ids = [resource_id for cluster in clusters for resource_id in cluster.resourceIds]
    assert sorted(clustered_ids) == sorted(IDS)
    assert all(len(cluster.centroid) == 2 for cluster in clusters)
    assert all(cluster.keywords for cluster in clusters)


def test_clustering_is_deterministic_and_filters_authorized_ids(tmp_path: Path):
    engine = make_engine(tmp_path)
    allowed = [IDS[0], IDS[1]]
    first = engine.cluster(allowed, 2)
    second = engine.cluster(allowed, 2)
    assert first == second
    clustered_ids = [resource_id for cluster in first for resource_id in cluster.resourceIds]
    assert sorted(clustered_ids) == sorted(allowed)


def test_empty_authorization_returns_no_clusters(tmp_path: Path):
    assert make_engine(tmp_path).cluster([], 2) == []


@pytest.mark.parametrize("count", [0, -1])
def test_invalid_cluster_count_is_rejected(tmp_path: Path, count: int):
    with pytest.raises(ValueError):
        make_engine(tmp_path).cluster(IDS, count)


def test_engine_uses_faiss_index_dimension(tmp_path: Path):
    make_engine(tmp_path)
    index = faiss.read_index(str(tmp_path / "generations" / next(
        path.name for path in (tmp_path / "generations").iterdir()
    ) / "index.faiss"))
    assert index.d == 2
