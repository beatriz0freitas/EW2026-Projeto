import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.mark.parametrize("token", ["", "  ", " secret "])
def test_missing_or_whitespace_token_rejected(token):
    with pytest.raises(ValidationError):
        Settings(internal_service_token=token)


@pytest.mark.parametrize("field,value", [
    ("ollama_connect_timeout_seconds", 0), ("ollama_read_timeout_seconds", -1),
    ("ollama_read_timeout_seconds", float("inf")), ("ollama_max_attempts", 0),
    ("ollama_max_attempts", 4), ("ollama_retry_backoff_seconds", -1),
    ("ollama_base_url", "file:///etc/passwd"), ("ollama_base_url", "http://user:secret@ollama"),
    ("ollama_base_url", "http://ollama/api/tags"), ("ollama_base_url", "http://ollama?token=secret"),
    ("ollama_base_url", "http://ollama:99999"), ("llm_model", " "),
])
def test_invalid_configuration_rejected(field, value):
    with pytest.raises(ValidationError):
        Settings(internal_service_token="test-token", **{field: value})


def test_environment_overrides_and_secret_redaction(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "secret-never-print")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434/")
    monkeypatch.setenv("OLLAMA_READ_TIMEOUT_SECONDS", "8")
    monkeypatch.setenv("OLLAMA_MAX_ATTEMPTS", "1")
    settings = Settings.from_env()
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_read_timeout_seconds == 8
    assert settings.ollama_max_attempts == 1
    assert "secret-never-print" not in repr(settings)
    assert "secret-never-print" not in settings.model_dump_json()
