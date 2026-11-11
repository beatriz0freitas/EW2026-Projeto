"""Deterministic resource indexing and atomic FAISS generation publication."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any, Protocol

import faiss
import numpy as np
import requests

from app.config import Settings

RESOURCE_ID_PATTERN = re.compile(r"^[0-9a-f]{24}$")
CURRENT_POINTER = "current.json"
INDEX_FILENAME = "index.faiss"
MANIFEST_FILENAME = "manifest.json"


class EmbeddingProvider(Protocol):
    def __call__(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input text."""


def normalize_resource_text(resource: Mapping[str, Any]) -> str:
    """Build the canonical text representation used for an embedding."""
    metadata = resource.get("metadata", {})
    values = metadata.get("resource", {}) if isinstance(metadata, Mapping) else {}
    hashtags = values.get("hashtags", [])
    if isinstance(hashtags, str):
        hashtags = [hashtags]
    if not isinstance(hashtags, list):
        raise ValueError("resource hashtags must be a list or string")
    fields = {
        "titulo": values.get("titulo", ""),
        "tema": values.get("tema", ""),
        "descricao": values.get("descricao", ""),
        "hashtags": sorted(str(tag).strip() for tag in hashtags),
    }
    if any(not isinstance(fields[key], str) for key in ("titulo", "tema", "descricao")):
        raise ValueError("resource text fields must be strings")
    if any(not value for key, value in fields.items() if key != "hashtags"):
        raise ValueError("resource title, theme and description are required")
    return json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _resource_values(resource: Mapping[str, Any]) -> Mapping[str, Any]:
    metadata = resource.get("metadata", {})
    values = metadata.get("resource", {}) if isinstance(metadata, Mapping) else {}
    if not isinstance(values, Mapping):
        raise ValueError("resource metadata must be an object")
    return values


def _resource_id(resource: Mapping[str, Any]) -> str:
    value = resource.get("_id")
    if not isinstance(value, str) or not RESOURCE_ID_PATTERN.fullmatch(value):
        raise ValueError("resource _id must be a lowercase Mongo ObjectId")
    return value


def _normalise_embeddings(embeddings: list[list[float]], count: int) -> np.ndarray:
    if len(embeddings) != count or not embeddings:
        raise ValueError("embedding count does not match resource count")
    try:
        matrix = np.asarray(embeddings, dtype=np.float32)
    except (TypeError, ValueError) as error:
        raise ValueError("embeddings must contain finite numeric vectors") from error
    if matrix.ndim != 2 or matrix.shape[1] == 0 or not np.isfinite(matrix).all():
        raise ValueError("embeddings must contain finite numeric vectors")
    norms = np.linalg.norm(matrix, axis=1)
    if np.any(norms <= 0):
        raise ValueError("embedding vectors must not be zero")
    matrix /= norms[:, np.newaxis]
    return np.ascontiguousarray(matrix, dtype=np.float32)


class OllamaEmbeddingClient:
    """Small embedding adapter with no implicit model downloads or retries."""

    def __init__(self, settings: Settings, session: requests.Session | None = None) -> None:
        self.settings = settings
        self.session = session if session is not None else requests.Session()
        self.session.trust_env = False

    def __call__(self, texts: list[str]) -> list[list[float]]:
        try:
            response = self.session.post(
                f"{self.settings.ollama_base_url}/api/embed",
                json={"model": self.settings.embedding_model, "input": texts},
                timeout=(
                    self.settings.ollama_connect_timeout_seconds,
                    self.settings.ollama_read_timeout_seconds,
                ),
                allow_redirects=False,
            )
        except requests.RequestException as error:
            raise RuntimeError("Ollama embedding request failed") from error
        try:
            if response.status_code != 200:
                raise RuntimeError("Ollama embedding request rejected")
            payload = response.json()
        except ValueError as error:
            raise RuntimeError("Ollama returned an invalid embedding response") from error
        finally:
            response.close()
        embeddings = payload.get("embeddings") if isinstance(payload, Mapping) else None
        if not isinstance(embeddings, list):
            raise RuntimeError("Ollama returned an invalid embedding response")
        return embeddings

    def close(self) -> None:
        self.session.close()


class FaissIndexer:
    """Build and publish one-resource-per-vector FAISS generations."""

    def __init__(
        self,
        index_path: Path,
        embedder: EmbeddingProvider | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.index_path = Path(index_path)
        self.embedder = embedder or OllamaEmbeddingClient(settings or Settings.from_env())

    @property
    def pointer_path(self) -> Path:
        return self.index_path / CURRENT_POINTER

    def _manifest_item(self, resource: Mapping[str, Any], text: str) -> dict[str, str]:
        values = _resource_values(resource)
        resource_id = _resource_id(resource)
        visibility = values.get("visibilidade", "publico")
        if visibility not in {"publico", "privado"}:
            raise ValueError("resource visibility must be publico or privado")
        return {
            "resourceId": resource_id,
            "chunkId": resource_id,
            "title": str(values["titulo"]).strip(),
            "theme": str(values["tema"]).strip(),
            "textHash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "visibility": visibility,
        }

    def build(self, resources: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
        resource_list = list(resources)
        texts = [normalize_resource_text(resource) for resource in resource_list]
        items = [
            self._manifest_item(resource, text)
            for resource, text in zip(resource_list, texts, strict=True)
        ]
        ids = [item["resourceId"] for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("resource IDs must be unique")
        embeddings = _normalise_embeddings(self.embedder(texts), len(resource_list))
        index = faiss.IndexFlatIP(embeddings.shape[1])
        index.add(embeddings)
        return self._publish(index, items)

    def reindex(
        self,
        resources: Iterable[Mapping[str, Any]],
        remove_ids: Iterable[str] = (),
    ) -> dict[str, Any]:
        resource_list = list(resources)
        incoming = {_resource_id(resource): resource for resource in resource_list}
        if len(incoming) != len(resource_list):
            raise ValueError("resource IDs must be unique")
        removed = set(remove_ids)
        if removed.intersection(incoming):
            raise ValueError("removed resource IDs cannot be reindexed")
        if not self.pointer_path.exists():
            return self.build(resource_list)

        current = self.load_manifest()
        pointer = json.loads(self.pointer_path.read_text(encoding="utf-8"))
        current_index = faiss.read_index(str(self.index_path / pointer["index"]))
        current_by_id = {
            item["resourceId"]: (position, item)
            for position, item in enumerate(current["items"])
        }
        prepared = [
            (resource, normalize_resource_text(resource))
            for resource in resource_list
        ]
        items = [self._manifest_item(resource, text) for resource, text in prepared]
        vectors: list[np.ndarray | None] = []
        to_embed: list[str] = []
        embed_positions: list[int] = []
        for position, item in enumerate(items):
            previous = current_by_id.get(item["resourceId"])
            if previous is not None and previous[1]["textHash"] == item["textHash"]:
                vectors.append(current_index.reconstruct(previous[0]))
            else:
                vectors.append(None)
                to_embed.append(prepared[position][1])
                embed_positions.append(position)
        if to_embed:
            new_vectors = _normalise_embeddings(self.embedder(to_embed), len(to_embed))
            for position, vector in zip(embed_positions, new_vectors, strict=True):
                vectors[position] = vector
        for item, previous in current_by_id.items():
            if item not in incoming and item not in removed:
                items.append(previous[1])
                vectors.append(current_index.reconstruct(previous[0]))
        if not items:
            raise ValueError("cannot publish an empty FAISS generation")
        matrix = _normalise_embeddings(
            [vector.tolist() for vector in vectors if vector is not None], len(items)
        )
        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)
        return self._publish(index, items)

    def remove(self, resource_ids: Iterable[str]) -> dict[str, Any]:
        current = self.load_manifest()
        removed = set(resource_ids)
        if not removed:
            return current
        if not removed.issubset({item["resourceId"] for item in current["items"]}):
            raise ValueError("cannot remove an unknown resource ID")
        pointer = json.loads(self.pointer_path.read_text(encoding="utf-8"))
        current_index = faiss.read_index(str(self.index_path / pointer["index"]))
        keep_positions = [
            position
            for position, item in enumerate(current["items"])
            if item["resourceId"] not in removed
        ]
        kept_items = [current["items"][position] for position in keep_positions]
        if keep_positions:
            vectors = np.vstack(
                [current_index.reconstruct(position) for position in keep_positions]
            )
            index = faiss.IndexFlatIP(current_index.d)
            index.add(np.ascontiguousarray(vectors, dtype=np.float32))
        else:
            index = faiss.IndexFlatIP(current_index.d)
        return self._publish(index, kept_items)

    def load_manifest(self) -> dict[str, Any]:
        try:
            pointer = json.loads(self.pointer_path.read_text(encoding="utf-8"))
            manifest_path = self.index_path / pointer["manifest"]
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
            raise RuntimeError("no valid FAISS generation is published") from error
        if manifest.get("version") != pointer.get("version"):
            raise RuntimeError("published FAISS generation is inconsistent")
        return manifest

    def _publish(self, index: faiss.Index, items: list[dict[str, str]]) -> dict[str, Any]:
        manifest_body = {"dimension": index.d, "metric": "cosine", "items": items}
        version = hashlib.sha256(
            json.dumps(manifest_body, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()[:16]
        manifest = {**manifest_body, "version": version}
        generation = self.index_path / "generations" / version
        self.index_path.mkdir(parents=True, exist_ok=True)
        generation.parent.mkdir(parents=True, exist_ok=True)
        if generation.exists():
            return manifest
        with tempfile.TemporaryDirectory(dir=generation.parent) as temporary:
            temporary_path = Path(temporary)
            faiss.write_index(index, str(temporary_path / INDEX_FILENAME))
            (temporary_path / MANIFEST_FILENAME).write_text(
                json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                encoding="utf-8",
            )
            os.replace(temporary_path, generation)
        pointer = {
            "version": version,
            "index": str(Path("generations") / version / INDEX_FILENAME),
            "manifest": str(Path("generations") / version / MANIFEST_FILENAME),
        }
        pointer_temp = self.index_path / f".{CURRENT_POINTER}.tmp"
        pointer_temp.write_text(
            json.dumps(pointer, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8"
        )
        os.replace(pointer_temp, self.pointer_path)
        return manifest
