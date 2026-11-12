"""Local Ollama embeddings with a verifiable model identity and no implicit retries."""

from collections.abc import Mapping

import requests

from app.config import Settings
from app.ollama_client import OllamaClient, OllamaUnavailable


class OllamaEmbeddingClient:
    def __init__(self, settings: Settings, session: requests.Session | None = None) -> None:
        self.settings = settings
        self.session = session if session is not None else requests.Session()
        self.session.trust_env = False
        self.diagnostics = OllamaClient(settings, session=self.session)

    @property
    def model_id(self) -> str:
        """Resolve the installed digest on each operation; mutable tags are not cache keys."""
        payload = self.diagnostics._get("/api/tags")
        models = payload.get("models")
        if isinstance(models, list):
            name = OllamaClient.canonical_model(self.settings.embedding_model)
            for model in models:
                if not isinstance(model, Mapping) or not isinstance(model.get("name"), str):
                    continue
                if OllamaClient.canonical_model(model["name"]) == name:
                    digest = model.get("digest")
                    if isinstance(digest, str) and digest.strip():
                        return f"{name}@{digest}"
        raise OllamaUnavailable("Embedding model digest unavailable")

    def __call__(self, texts: list[str]) -> list[list[float]]:
        try:
            response = self.session.post(
                f"{self.settings.ollama_base_url}/api/embed",
                json={"model": self.settings.embedding_model, "input": texts, "truncate": False},
                timeout=(
                    self.settings.ollama_connect_timeout_seconds,
                    self.settings.ollama_embedding_timeout_seconds,
                ),
                allow_redirects=False,
            )
        except requests.RequestException:
            # A timeout may follow completed inference. Do not blindly repeat it.
            raise OllamaUnavailable("Ollama embedding request failed") from None
        try:
            if response.status_code != 200:
                raise OllamaUnavailable("Ollama embedding request rejected")
            try:
                payload = response.json()
            except ValueError:
                raise OllamaUnavailable("Invalid embedding response") from None
        finally:
            response.close()
        embeddings = payload.get("embeddings") if isinstance(payload, Mapping) else None
        if not isinstance(embeddings, list) or "error" in payload:
            raise OllamaUnavailable("Invalid embedding response")
        return embeddings

    def close(self) -> None:
        self.session.close()
