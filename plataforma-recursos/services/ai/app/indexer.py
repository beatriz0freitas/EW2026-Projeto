"""Public metadata index: incremental vectors and immutable, atomic FAISS generations."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import tempfile
import unicodedata
from collections.abc import Iterable, Mapping
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Protocol

import faiss
import numpy as np

from app.config import Settings
from app.embeddings import OllamaEmbeddingClient

RESOURCE_ID_PATTERN = re.compile(r"^[0-9a-f]{24}$")
VERSION_PATTERN = re.compile(r"^[0-9a-f]{64}$")
CURRENT_POINTER = "current.json"
INDEX_FILENAME = "index.faiss"
MANIFEST_FILENAME = "manifest.json"
SCHEMA_VERSION = 2
NORMALIZATION_VERSION = "metadata-nfc-v1"


class EmbeddingProvider(Protocol):
    @property
    def model_id(self) -> str:
        """Immutable model/digest identity, including preprocessing options if any."""

    def __call__(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input text."""


def _json_bytes(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def _digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _resource_values(resource: Mapping[str, Any]) -> Mapping[str, Any]:
    if not isinstance(resource, Mapping):
        raise ValueError("resource must be an object")
    metadata = resource.get("metadata")
    values = metadata.get("resource") if isinstance(metadata, Mapping) else None
    if not isinstance(values, Mapping):
        raise ValueError("resource metadata must be an object")
    return values


def _resource_id(value: Any) -> str:
    if not isinstance(value, str) or not RESOURCE_ID_PATTERN.fullmatch(value):
        raise ValueError("resource ID must be a lowercase Mongo ObjectId")
    return value


def _text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        raise ValueError("resource text fields must be strings")
    value = " ".join(unicodedata.normalize("NFC", value).split())
    if not value or len(value) > limit:
        raise ValueError("resource text is empty or exceeds its limit")
    return value


def normalize_resource_text(resource: Mapping[str, Any]) -> str:
    """Only educational fields, NFC accents preserved, whitespace and tag order canonical."""
    values = _resource_values(resource)
    hashtags = values.get("hashtags", [])
    if isinstance(hashtags, str):
        hashtags = [hashtags]
    if not isinstance(hashtags, list) or len(hashtags) > 100:
        raise ValueError("resource hashtags must be a bounded list or string")
    fields = {
        "titulo": _text(values.get("titulo"), 300),
        "tema": _text(values.get("tema"), 300),
        "descricao": _text(values.get("descricao"), 10000),
        "hashtags": sorted({_text(tag, 100) for tag in hashtags}),
    }
    return _json_bytes(fields).decode("utf-8")


def _prepare(resources: Iterable[Mapping[str, Any]]) -> dict[str, dict | None]:
    result = {}
    for resource in resources:
        values = _resource_values(resource)
        resource_id = _resource_id(resource.get("_id"))
        if resource_id in result:
            raise ValueError("resource IDs must be unique")
        # Missing/unknown visibility is denied, never inferred as public.
        if values.get("visibilidade") != "publico":
            result[resource_id] = None
            continue
        text = normalize_resource_text(resource)
        fields = json.loads(text)
        text_hash = _digest(text.encode("utf-8"))
        result[resource_id] = {
            "resourceId": resource_id,
            "chunkId": f"{resource_id}:{text_hash[:16]}",
            "title": fields["titulo"],
            "theme": fields["tema"],
            "text": text,
            "textHash": text_hash,
            "visibility": "publico",
        }
    return result


def _normalise_embeddings(embeddings: list[list[float]], count: int) -> np.ndarray:
    if not isinstance(embeddings, list) or len(embeddings) != count or count == 0:
        raise ValueError("embedding count does not match resource count")
    try:
        matrix = np.asarray(embeddings)
        if matrix.dtype.kind not in "fi" or matrix.ndim != 2 or not matrix.shape[1]:
            raise ValueError("invalid embedding shape or type")
        matrix = matrix.astype(np.float64)
        if not np.isfinite(matrix).all():
            raise ValueError("nonfinite embedding")
        # Scaling avoids norm overflow and underflow for finite, nonzero vectors.
        scales = np.max(np.abs(matrix), axis=1, keepdims=True)
        if np.any(scales == 0):
            raise ValueError("zero embedding")
        matrix /= scales
        matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
        return np.ascontiguousarray(matrix, dtype=np.float32)
    except (TypeError, ValueError, OverflowError):
        raise ValueError("embeddings must be finite nonzero numeric vectors") from None


def load_generation(index_path: Path) -> tuple[faiss.Index, dict]:
    """Read the pointer ONCE, validate paths and hashes before deserializing FAISS."""
    root = Path(index_path)
    try:
        pointer = json.loads((root / CURRENT_POINTER).read_bytes())
        version = pointer["version"]
        if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
            raise ValueError("invalid version")
        base = Path("generations") / version
        if pointer["index"] != str(base / INDEX_FILENAME):
            raise ValueError("invalid index path")
        if pointer["manifest"] != str(base / MANIFEST_FILENAME):
            raise ValueError("invalid manifest path")
        manifest = json.loads((root / pointer["manifest"]).read_bytes())
        body = {key: value for key, value in manifest.items() if key != "version"}
        if manifest["version"] != version or _digest(_json_bytes(body)) != version:
            raise ValueError("manifest checksum mismatch")
        if (
            manifest["schemaVersion"] != SCHEMA_VERSION
            or manifest["normalization"] != NORMALIZATION_VERSION
            or manifest["metric"] != "cosine"
        ):
            raise ValueError("unsupported generation format")
        raw = (root / pointer["index"]).read_bytes()
        if _digest(raw) != manifest["indexSha256"]:
            raise ValueError("index checksum mismatch")
        index = faiss.deserialize_index(np.frombuffer(raw, dtype=np.uint8).copy())
        items = manifest["items"]
        if (
            not isinstance(index, faiss.IndexFlatIP)
            or index.d != manifest["dimension"]
            or not isinstance(items, list)
            or len(items) != index.ntotal
        ):
            raise ValueError("index/manifest mismatch")
        seen = set()
        for position, item in enumerate(items):
            resource_id = _resource_id(item["resourceId"])
            if (
                resource_id in seen
                or item["vectorIndex"] != position
                or item["visibility"] != "publico"
                or _digest(item["text"].encode("utf-8")) != item["textHash"]
            ):
                raise ValueError("invalid item mapping")
            seen.add(resource_id)
        if items:
            vectors = index.reconstruct_n(0, index.ntotal)
            if not np.isfinite(vectors).all() or not np.allclose(
                np.linalg.norm(vectors, axis=1), 1, atol=1e-5
            ):
                raise ValueError("invalid normalized vectors")
        return index, manifest
    except (OSError, KeyError, TypeError, ValueError, AttributeError, RuntimeError):
        raise RuntimeError(
            "no valid FAISS generation is published; rebuild if using legacy data"
        ) from None


def _sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_sync(path: Path, content: bytes) -> None:
    with path.open("wb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


class FaissIndexer:
    """One public resource per vector. Writers serialize using POSIX flock (Linux)."""

    def __init__(
        self,
        index_path: Path,
        embedder: EmbeddingProvider | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.index_path = Path(index_path)
        self.embedder = embedder
        self.settings = settings
        self._owns_embedder = embedder is None

    @property
    def pointer_path(self) -> Path:
        return self.index_path / CURRENT_POINTER

    def close(self) -> None:
        if self._owns_embedder and self.embedder is not None:
            self.embedder.close()

    def _provider(self) -> EmbeddingProvider:
        if self.embedder is None:
            self.embedder = OllamaEmbeddingClient(self.settings or Settings.from_env())
        return self.embedder

    @contextmanager
    def _writer(self):
        self.index_path.mkdir(parents=True, exist_ok=True)
        with (self.index_path / ".writer.lock").open("a+b") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

    def build(self, resources: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
        """Synchronize a COMPLETE authoritative snapshot, reusing unchanged vectors."""
        return self._update(_prepare(resources), set(), full=True)

    def reindex(
        self, resources: Iterable[Mapping[str, Any]], remove_ids: Iterable[str] = ()
    ) -> dict[str, Any]:
        """Apply upserts/revocations; unspecified resources remain in the current generation."""
        prepared = _prepare(resources)
        removed = {_resource_id(value) for value in remove_ids}
        if removed.intersection(prepared):
            raise ValueError("removed resource IDs cannot be reindexed")
        return self._update(prepared, removed, full=False)

    def remove(self, resource_ids: Iterable[str]) -> dict[str, Any]:
        """Idempotent removal, including the last vector, with no Ollama dependency."""
        return self.reindex([], remove_ids=resource_ids)

    def load_manifest(self) -> dict[str, Any]:
        return load_generation(self.index_path)[1]

    def _update(self, prepared: dict, removed: set[str], *, full: bool) -> dict:
        with self._writer():
            current = None
            previous: dict[str, tuple[dict, np.ndarray]] = {}
            dimension = 0
            old_model = None
            if self.pointer_path.exists():
                old_index, current = load_generation(self.index_path)
                dimension = old_index.d
                old_model = current["embeddingModel"]
                previous = {
                    item["resourceId"]: (item, old_index.reconstruct(position))
                    for position, item in enumerate(current["items"])
                }
            # Revoke deleted, privatized AND stale content before any network call.
            retained = {
                key: pair
                for key, pair in previous.items()
                if key not in removed
                and (not full or key in prepared)
                and (
                    key not in prepared
                    or (
                        prepared[key] is not None
                        and prepared[key]["textHash"] == pair[0]["textHash"]
                    )
                )
            }
            if retained.keys() != previous.keys():
                current = self._publish(retained, dimension, old_model)
            public = {key: value for key, value in prepared.items() if value is not None}
            if not public:
                if current is not None:
                    return current
                return self._publish(retained, dimension, old_model)

            provider = self._provider()
            model = provider.model_id
            if not isinstance(model, str) or not model.strip():
                raise ValueError("embedding provider must declare an immutable model_id")
            if old_model is not None and model != old_model:
                if not full:
                    raise ValueError("embedding model changed; supply a full snapshot with build")
                retained = {}
                dimension = 0
                self._publish(retained, dimension, model)
            pending = sorted(set(public) - set(retained))
            batch_size = self.settings.embedding_batch_size if self.settings else 16
            for offset in range(0, len(pending), batch_size):
                batch = pending[offset : offset + batch_size]
                vectors = _normalise_embeddings(
                    provider([public[key]["text"] for key in batch]), len(batch)
                )
                if dimension and dimension != vectors.shape[1]:
                    raise ValueError("embedding dimension changed within the same model")
                dimension = vectors.shape[1]
                retained.update(
                    {key: (public[key], vector) for key, vector in zip(batch, vectors, strict=True)}
                )
            if pending and provider.model_id != model:
                raise ValueError("embedding model changed during indexing; retry a full snapshot")
            return self._publish(retained, dimension, model)

    def _publish(self, entries: dict, dimension: int, model: str | None) -> dict:
        items = []
        vectors = []
        for position, resource_id in enumerate(sorted(entries)):
            item, vector = entries[resource_id]
            items.append({**item, "vectorIndex": position})
            vectors.append(vector)
        index = faiss.IndexFlatIP(dimension)
        if vectors:
            index.add(np.ascontiguousarray(vectors, dtype=np.float32))
        index_bytes = faiss.serialize_index(index).tobytes()
        body = {
            "schemaVersion": SCHEMA_VERSION,
            "normalization": NORMALIZATION_VERSION,
            "dimension": dimension,
            "metric": "cosine",
            "embeddingModel": model,
            "indexSha256": _digest(index_bytes),
            "items": items,
        }
        version = _digest(_json_bytes(body))
        manifest = {**body, "version": version}
        base = Path("generations") / version
        generation = self.index_path / base
        generation.parent.mkdir(parents=True, exist_ok=True)
        manifest_bytes = _json_bytes(manifest)
        if not generation.exists():
            with tempfile.TemporaryDirectory(dir=generation.parent) as temporary:
                stage = Path(temporary)
                _write_sync(stage / INDEX_FILENAME, index_bytes)
                _write_sync(stage / MANIFEST_FILENAME, manifest_bytes)
                _sync_directory(stage)
                os.replace(stage, generation)
            _sync_directory(generation.parent)
        elif (generation / INDEX_FILENAME).read_bytes() != index_bytes or (
            generation / MANIFEST_FILENAME
        ).read_bytes() != manifest_bytes:
            raise RuntimeError("existing FAISS generation is corrupt")
        pointer = {
            "version": version,
            "index": str(base / INDEX_FILENAME),
            "manifest": str(base / MANIFEST_FILENAME),
        }
        # Always update the pointer, including A -> B -> A and orphan recovery after a crash.
        with tempfile.NamedTemporaryFile(
            dir=self.index_path, prefix=".current-", delete=False
        ) as tmp:
            temporary_pointer = Path(tmp.name)
        try:
            _write_sync(temporary_pointer, _json_bytes(pointer))
            os.replace(temporary_pointer, self.pointer_path)
            _sync_directory(self.index_path)
        finally:
            temporary_pointer.unlink(missing_ok=True)
        return manifest
