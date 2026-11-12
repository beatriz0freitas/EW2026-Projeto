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
    model_id = "test-embeddings@v1"

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
    assert [item["chunkId"].split(":")[0] for item in manifest["items"]] == [
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
    assert [item["resourceId"] for item in manifest["items"]] == ["663e00000000000000000002"]
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


def test_private_resources_never_reach_embedder(tmp_path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    manifest = indexer.build(
        [
            resource("663e00000000000000000001", "primeiro"),
            resource("663e00000000000000000002", "segredo", "privado"),
        ]
    )
    assert len(manifest["items"]) == 1
    assert "segredo" not in str(embedder.calls)


def test_privatization_removes_previously_public_vector(tmp_path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    indexer.build([resource("663e00000000000000000001", "primeiro")])
    manifest = indexer.reindex([resource("663e00000000000000000001", "segredo", "privado")])
    assert manifest["items"] == []
    assert len(embedder.calls) == 1


def test_return_to_existing_generation_updates_pointer(tmp_path):
    indexer = FaissIndexer(tmp_path, FakeEmbedder())
    first = indexer.build([resource("663e00000000000000000001", "primeiro")])
    indexer.build([resource("663e00000000000000000002", "segundo")])
    restored = indexer.build([resource("663e00000000000000000001", "primeiro")])
    assert first["version"] == restored["version"]
    assert indexer.load_manifest()["version"] == restored["version"]


ID1 = "663e00000000000000000001"
ID2 = "663e00000000000000000002"
ID3 = "663e00000000000000000003"


def test_whitespace_unicode_and_duplicate_tags_are_canonical():
    first = resource(ID1, "Título")
    second = resource(ID1, "  Ti\u0301tulo\n")
    second["metadata"]["resource"]["hashtags"] = ["alfa", "zeta", "alfa"]
    assert normalize_resource_text(first) == normalize_resource_text(second)


@pytest.mark.parametrize("visibility", [None, "", "unknown"])
def test_missing_or_unknown_visibility_is_not_indexed(tmp_path, visibility):
    record = resource(ID1)
    record["metadata"]["resource"]["visibilidade"] = visibility
    embedder = FakeEmbedder()
    manifest = FaissIndexer(tmp_path, embedder).build([record])
    assert manifest["items"] == []
    assert embedder.calls == []


def test_reindex_embeds_only_changed_text_and_keeps_other_resources(tmp_path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    indexer.build([resource(ID1, "primeiro"), resource(ID2)])
    indexer.reindex([resource(ID1, "primeiro")])
    assert len(embedder.calls) == 1
    changed = indexer.reindex([resource(ID1, "alterado")])
    assert len(embedder.calls) == 2
    assert len(embedder.calls[-1]) == 1
    assert {item["resourceId"] for item in changed["items"]} == {ID1, ID2}


def test_full_snapshot_removes_absent_resources(tmp_path):
    indexer = FaissIndexer(tmp_path, FakeEmbedder())
    indexer.build([resource(ID1), resource(ID2)])
    manifest = indexer.build([resource(ID2)])
    assert [item["resourceId"] for item in manifest["items"]] == [ID2]


def test_empty_index_and_idempotent_removal_need_no_ollama(tmp_path):
    from app.indexer import load_generation

    indexer = FaissIndexer(tmp_path)
    empty = indexer.build([])
    assert indexer.remove([ID1]) == empty
    index, _ = load_generation(tmp_path)
    assert index.ntotal == 0


def test_last_vector_can_be_removed_and_added_back(tmp_path):
    indexer = FaissIndexer(tmp_path, FakeEmbedder())
    initial = indexer.build([resource(ID1)])
    assert indexer.remove([ID1])["items"] == []
    assert indexer.reindex([resource(ID1)])["version"] == initial["version"]


def test_deleted_and_stale_content_stay_revoked_if_embedding_fails(tmp_path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    indexer.build([resource(ID1), resource(ID2), resource(ID3)])

    class BrokenEmbedder:
        model_id = FakeEmbedder.model_id

        def __call__(self, texts):
            raise RuntimeError("unavailable")

    indexer.embedder = BrokenEmbedder()
    with pytest.raises(RuntimeError):
        indexer.reindex([resource(ID1, "updated"), resource(ID2, visibility="privado")])
    assert [item["resourceId"] for item in indexer.load_manifest()["items"]] == [ID3]


def test_changed_model_requires_full_snapshot_and_reembeds(tmp_path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    old = indexer.build([resource(ID1)])
    embedder.model_id = "different-model@digest2"
    with pytest.raises(ValueError, match="full snapshot"):
        indexer.reindex([resource(ID1)])
    new = indexer.build([resource(ID1)])
    assert new["embeddingModel"] != old["embeddingModel"]
    assert new["version"] != old["version"]
    assert len(embedder.calls) == 2


def test_model_change_during_embedding_never_publishes_mixed_vectors(tmp_path):
    class ChangingEmbedder(FakeEmbedder):
        def __call__(self, texts):
            self.model_id = "new-digest"
            return super().__call__(texts)

    indexer = FaissIndexer(tmp_path, ChangingEmbedder())
    with pytest.raises(ValueError, match="during indexing"):
        indexer.build([resource(ID1)])
    assert not indexer.pointer_path.exists()


@pytest.mark.parametrize(
    "vectors",
    [
        [],
        [[0, 0]],
        [[float("nan"), 1]],
        [[float("inf"), 1]],
        [[True, False]],
        [["1", "2"]],
        [[1], [1, 2]],
    ],
)
def test_invalid_embeddings_never_publish(tmp_path, vectors):
    class InvalidEmbedder:
        model_id = "invalid-test"

        def __call__(self, texts):
            return vectors

    indexer = FaissIndexer(tmp_path, InvalidEmbedder())
    with pytest.raises(ValueError):
        indexer.build([resource(ID1)])
    assert not indexer.pointer_path.exists()


def test_extreme_finite_vectors_normalize_without_overflow():
    from app.indexer import _normalise_embeddings

    vectors = _normalise_embeddings([[1e300, 1e300], [1e-300, 1e-300]], 2)
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1)


def test_dimension_mismatch_rejected(tmp_path):
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    indexer.build([resource(ID1)])

    class WrongDimension(FakeEmbedder):
        def __call__(self, texts):
            return [[1, 2, 3] for _ in texts]

    indexer.embedder = WrongDimension()
    with pytest.raises(ValueError, match="dimension"):
        indexer.reindex([resource(ID2)])
    assert len(indexer.load_manifest()["items"]) == 1


def test_input_order_does_not_change_version_or_positions(tmp_path):
    indexer = FaissIndexer(tmp_path, FakeEmbedder())
    resources = [resource(ID2), resource(ID1, "primeiro")]
    first = indexer.build(resources)
    assert first == indexer.build(list(reversed(resources)))
    assert [item["vectorIndex"] for item in first["items"]] == [0, 1]


def test_failed_pointer_publication_recovers_existing_orphan_generation(tmp_path, monkeypatch):
    import app.indexer as module

    indexer = FaissIndexer(tmp_path, FakeEmbedder())
    initial = indexer.build([resource(ID1)])
    replace = module.os.replace

    def fail_pointer(source, destination):
        if Path(destination) == indexer.pointer_path:
            raise OSError("simulated crash")
        return replace(source, destination)

    monkeypatch.setattr(module.os, "replace", fail_pointer)
    with pytest.raises(OSError):
        indexer.reindex([resource(ID2)])
    assert indexer.load_manifest() == initial
    monkeypatch.setattr(module.os, "replace", replace)
    result = indexer.reindex([resource(ID2)])
    assert indexer.load_manifest() == result
    assert len(result["items"]) == 2


@pytest.mark.parametrize("target", ["manifest", "index", "pointer"])
def test_corrupt_generation_rejected_before_faiss_deserialization(tmp_path, monkeypatch, target):
    import app.indexer as module

    indexer = FaissIndexer(tmp_path, FakeEmbedder())
    indexer.build([resource(ID1)])
    pointer = json.loads(indexer.pointer_path.read_text())
    if target == "pointer":
        pointer["index"] = "../../arbitrary-file"
        indexer.pointer_path.write_text(json.dumps(pointer))
    else:
        (tmp_path / pointer[target]).write_bytes(b"corrupt")

    def must_not_deserialize(*args):
        pytest.fail("deserialized unverified bytes")

    monkeypatch.setattr(module.faiss, "deserialize_index", must_not_deserialize)
    with pytest.raises(RuntimeError, match="no valid"):
        indexer.load_manifest()


def test_concurrent_upserts_do_not_lose_updates(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    indexer = FaissIndexer(tmp_path, FakeEmbedder())
    indexer.build([resource(ID1)])

    def update(resource_id):
        return FaissIndexer(tmp_path, FakeEmbedder()).reindex([resource(resource_id)])

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(update, [ID2, ID3]))
    assert {item["resourceId"] for item in indexer.load_manifest()["items"]} == {ID1, ID2, ID3}


def test_full_fixture_indexes_only_public_resources(tmp_path):
    # Locate a checkout corpus or the explicit mount used by standalone Docker tests.
    fixture = next(
        (parent / "data/ai-fixtures/resources.json"
         for parent in Path(__file__).resolve().parents
         if (parent / "data/ai-fixtures/resources.json").exists()),
        Path("/fixtures/resources.json"),
    )
    if not fixture.exists():
        pytest.skip("repository corpus not mounted in the standalone test container")
    records = json.loads(fixture.read_text())
    private_texts = [
        record["metadata"]["resource"]["titulo"]
        for record in records
        if record["metadata"]["resource"]["visibilidade"] != "publico"
    ]
    embedder = FakeEmbedder()
    indexer = FaissIndexer(tmp_path, embedder)
    result = indexer.build(records)
    assert len(result["items"]) == 21
    assert [len(batch) for batch in embedder.calls] == [16, 5]
    assert all(title not in str(embedder.calls) for title in private_texts)
    assert all(title not in json.dumps(result, ensure_ascii=False) for title in private_texts)
    count = len(embedder.calls)
    assert indexer.build(records) == result
    assert len(embedder.calls) == count


def test_index_contains_no_storage_paths_or_owner(tmp_path):
    record = resource(ID1)
    record.update(aipPath="/sensitive", aipFile={"path": "/private"}, produtor="owner-secret")
    embedder = FakeEmbedder()
    manifest = FaissIndexer(tmp_path, embedder).build([record])
    for secret in ("/sensitive", "/private", "owner-secret"):
        assert secret not in str(manifest)
        assert secret not in str(embedder.calls)
