"""Explicit environment configuration; never read or print application secrets."""

import os
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    internal_service_token: SecretStr
    ollama_base_url: str = "http://ollama:11434"
    llm_model: str = "llama3.2:1b"
    embedding_model: str = "nomic-embed-text"
    faiss_index_path: Path = Path("/app/data/faiss_index")
    ollama_connect_timeout_seconds: float = Field(default=2, gt=0, le=30, allow_inf_nan=False)
    ollama_read_timeout_seconds: float = Field(default=5, gt=0, le=120, allow_inf_nan=False)
    ollama_max_attempts: int = Field(default=2, ge=1, le=3)
    ollama_retry_backoff_seconds: float = Field(default=0.25, ge=0, le=2, allow_inf_nan=False)
    ollama_embedding_timeout_seconds: float = Field(default=120, gt=0, le=600, allow_inf_nan=False)
    embedding_batch_size: int = Field(default=16, ge=1, le=64)

    @field_validator("internal_service_token")
    @classmethod
    def require_token(cls, value: SecretStr) -> SecretStr:
        token = value.get_secret_value()
        if not token.strip() or token != token.strip():
            raise ValueError(
                "INTERNAL_SERVICE_TOKEN must be nonempty without surrounding whitespace"
            )
        return value

    @field_validator("ollama_base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        url = urlsplit(value)
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username is not None
            or url.password is not None
            or url.query
            or url.fragment
            or url.path not in {"", "/"}
        ):
            raise ValueError("OLLAMA_BASE_URL must be an HTTP(S) origin without credentials")
        _ = url.port
        return value.rstrip("/")

    @field_validator("llm_model", "embedding_model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        if not value.strip() or any(char.isspace() for char in value):
            raise ValueError("Model names must be nonempty and contain no whitespace")
        return value

    @classmethod
    def from_env(cls) -> "Settings":
        values = {
            field: os.environ[field.upper()]
            for field in cls.model_fields
            if field.upper() in os.environ
        }
        values.setdefault("internal_service_token", "")
        return cls.model_validate(values)
