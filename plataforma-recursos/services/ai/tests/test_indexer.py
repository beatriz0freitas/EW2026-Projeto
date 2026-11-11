import json
from pathlib import Path

import faiss
import numpy as np
import pytest

from app.indexer import FaissIndexer, normalize_resource_text


def resource(resource_id: str, title: str = "Título", visibility: str = "publico") -> dict:
    return {
        "_id": resource_id,
        "metadata": {
            "resource": {
                "titulo": title,
                "descricao": "Descrição educativa.",
                "tema": "Tema",
                "hashtags": ["zeta", "alfa"],
                "visibilidade": visibility,
            }
        },
    }


class FakeEmbedder:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[1.0, 0.0] if "primeiro" in text else [0.0, 1.0] for text in texts]


def test_normalization_is_canonical_and_orders_hashtags():
    first = resource("663e00000000000000000001", title="primeiro")
    second = resource("663e00000000000000000001", title="primeiro")
    second["metadata"]["resource"]["hashtags"] = ["alfa", "zeta"]
    assert normalize_resource_text(first) == normalize_resource_text(second)


def test_build_publishes_manifest_and_faiss_index_atomically(tmp_path: Path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    manifest = indexer.build(
        [
            resource("663e00000000000000000001", title="primeiro"),
            resource("663e00000000000000000002", title="segundo"),
        ]
    )

    pointer = json.loads((tmp_path / "current.json").read_text())
    assert pointer["version"] == manifest["version"]
    assert manifest["dimension"] == 2
    assert manifest["metric"] == "cosine"
    assert [item["chunkId"] for item in manifest["items"]] == [
        "663e00000000000000000001",
        "663e00000000000000000002",
    ]
    assert manifest["items"][0]["textHash"]
    index = faiss.read_index(str(tmp_path / pointer["index"]))
    distances, positions = index.search(np.asarray([[1.0, 0.0]], dtype=np.float32), 1)
    assert positions.tolist() == [[0]]
    assert distances[0][0] == pytest.approx(1.0)


def test_reindex_is_deterministic_for_same_resources(tmp_path: Path):
    resources = [resource("663e00000000000000000001", title="primeiro")]
    first = FaissIndexer(tmp_path, FakeEmbedder()).build(resources)
    second = FaissIndexer(tmp_path, FakeEmbedder()).reindex(resources)
    assert first == second


def test_remove_updates_manifest_without_reembedding(tmp_path: Path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    indexer.build(
        [
            resource("663e00000000000000000001", title="primeiro"),
            resource("663e00000000000000000002", title="segundo"),
        ]
    )
    manifest = indexer.remove(["663e00000000000000000001"])
    assert [item["resourceId"] for item in manifest["items"]] == [
        "663e00000000000000000002"
    ]
    assert len(embedder.calls) == 1
    index_path = tmp_path / "generations" / manifest["version"] / "index.faiss"
    assert faiss.read_index(str(index_path)).ntotal == 1


@pytest.mark.parametrize(
    "invalid",
    [
        resource("not-an-object-id"),
        {**resource("663e0000000000000000000001"), "metadata": {"resource": {}}},
    ],
)
def test_invalid_resources_are_rejected(tmp_path: Path, invalid: dict):
    with pytest.raises(ValueError):
        FaissIndexer(tmp_path, FakeEmbedder()).build([invalid])
