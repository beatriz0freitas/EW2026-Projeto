from pathlib import Path

import pytest

from app.indexer import FaissIndexer
from app.retrieval import FaissRetriever

IDS = [
    "663e00000000000000000001",
    "663e00000000000000000002",
    "663e00000000000000000003",
]


def resource(resource_id: str, title: str, description: str) -> dict:
    return {
        "_id": resource_id,
        "metadata": {
            "resource": {
                "titulo": title,
                "descricao": description,
                "tema": "Tema",
                "hashtags": [],
                "visibilidade": "publico",
            }
        },
    }


class Embedder:
    model_id = "test-embedding-model"

    def __init__(self, vectors: list[list[float]]) -> None:
        self.vectors = vectors
        self.calls: list[list[str]] = []

    def __call__(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return self.vectors[: len(texts)]


def make_retriever(tmp_path: Path) -> tuple[FaissRetriever, Embedder]:
    index_embedder = Embedder([[1, 0], [0.8, 0.2], [0, 1]])
    FaissIndexer(tmp_path, index_embedder).build(
        [
            resource(IDS[0], "Primeiro", "Descrição do primeiro."),
            resource(IDS[1], "Segundo", "Descrição do segundo."),
            resource(IDS[2], "Terceiro", "Descrição do terceiro."),
        ]
    )
    query_embedder = Embedder([[1, 0]])
    return FaissRetriever(tmp_path, query_embedder), query_embedder


def test_search_filters_before_top_k_and_preserves_provenance(tmp_path: Path):
    retriever, embedder = make_retriever(tmp_path)
    response = retriever.search("consulta", [IDS[2], IDS[1]], top_k=1)
    assert len(response.items) == 1
    assert response.items[0].resourceId == IDS[1]
    assert response.items[0].chunkId == f"{IDS[1]}:{response.items[0].chunkId.split(':')[1]}"
    assert response.items[0].excerpt == "Descrição do segundo."
    assert response.items[0].score == pytest.approx(0.9701425, rel=1e-5)
    assert embedder.calls == [["consulta"]]
    assert response.indexVersion != "none"


def test_empty_or_unauthorized_search_does_not_call_embedder(tmp_path: Path):
    retriever, embedder = make_retriever(tmp_path)
    assert retriever.search("consulta", [], top_k=5).items == []
    assert retriever.search("consulta", ["663e00000000000000000099"], top_k=5).items == []
    assert embedder.calls == []


@pytest.mark.parametrize("query_vectors", [[[0, 0]], [[float("nan"), 1]], [[1, 2], [3, 4]]])
def test_invalid_query_embeddings_are_rejected(tmp_path: Path, query_vectors):
    retriever, _ = make_retriever(tmp_path)
    with pytest.raises(ValueError):
        retriever.embedder = lambda texts: query_vectors
        retriever.search("consulta", [IDS[0]], top_k=5)
