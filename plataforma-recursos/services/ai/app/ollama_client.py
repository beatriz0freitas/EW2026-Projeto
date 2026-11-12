"""Bounded, read-only Ollama diagnostics. No model pulls or inference on health checks."""

import time
from collections.abc import Callable

import requests

from app.config import Settings


class OllamaUnavailable(Exception):
    """Safe error: upstream URLs, bodies and exception strings are never exposed."""


class OllamaClient:
    RETRYABLE_STATUS = {429, 500, 502, 503, 504}

    def __init__(
        self,
        settings: Settings,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.settings = settings
        self.session = session if session is not None else requests.Session()
        self.session.trust_env = False
        self.sleep = sleep

    def close(self) -> None:
        self.session.close()

    def _get(self, path: str) -> dict:
        for attempt in range(self.settings.ollama_max_attempts):
            try:
                response = self.session.get(
                    self.settings.ollama_base_url + path,
                    timeout=(
                        self.settings.ollama_connect_timeout_seconds,
                        self.settings.ollama_read_timeout_seconds,
                    ),
                    allow_redirects=False,
                )
            except (requests.Timeout, requests.ConnectionError):
                pass  # Retry transient transport errors with a bounded backoff.
            except requests.RequestException:
                raise OllamaUnavailable("Ollama request failed") from None
            else:
                try:
                    if response.status_code == 200:
                        try:
                            payload = response.json()
                        except ValueError:
                            raise OllamaUnavailable("Invalid Ollama response") from None
                        if not isinstance(payload, dict) or "error" in payload:
                            raise OllamaUnavailable("Invalid Ollama response")
                        return payload
                    if response.status_code not in self.RETRYABLE_STATUS:
                        raise OllamaUnavailable("Ollama request rejected")
                finally:
                    response.close()
            if attempt + 1 < self.settings.ollama_max_attempts:
                self.sleep(self.settings.ollama_retry_backoff_seconds * (2**attempt))
        raise OllamaUnavailable("Ollama unavailable")

    def _model_names(self, path: str) -> set[str]:
        models = self._get(path).get("models")
        if not isinstance(models, list):
            raise OllamaUnavailable("Invalid Ollama model list")
        names = set()
        for model in models:
            name = model.get("name") if isinstance(model, dict) else None
            if not isinstance(name, str) or not name.strip():
                raise OllamaUnavailable("Invalid Ollama model entry")
            names.add(self.canonical_model(name))
        return names

    @staticmethod
    def canonical_model(name: str) -> str:
        return name if ":" in name.rsplit("/", 1)[-1] else name + ":latest"

    def available_models(self) -> set[str]:
        return self._model_names("/api/tags")

    def loaded_models(self) -> set[str]:
        return self._model_names("/api/ps")
