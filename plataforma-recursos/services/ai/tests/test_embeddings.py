from unittest.mock import Mock

import pytest
import requests

from app.embeddings import OllamaEmbeddingClient
from app.ollama_client import OllamaUnavailable


def test_model_identity_uses_installed_digest(settings, session, http_response):
    session.get.return_value = http_response(
        {"models": [{"name": "nomic-embed-text:latest", "digest": "sha256:original"}]}
    )
    client = OllamaEmbeddingClient(settings, session)
    assert client.model_id == "nomic-embed-text:latest@sha256:original"
    session.get.return_value = http_response(
        {"models": [{"name": "nomic-embed-text:latest", "digest": "sha256:updated"}]}
    )
    assert client.model_id == "nomic-embed-text:latest@sha256:updated"


@pytest.mark.parametrize(
    "payload", [{}, {"models": []}, {"models": [{"name": "nomic-embed-text"}]}]
)
def test_missing_digest_cannot_silently_reuse_vectors(settings, session, http_response, payload):
    session.get.return_value = http_response(payload)
    with pytest.raises(OllamaUnavailable, match="digest"):
        _ = OllamaEmbeddingClient(settings, session).model_id


def test_embed_uses_inference_timeout_and_disables_truncation(settings, session, http_response):
    response = http_response({"embeddings": [[1, 2]]})
    session.post.return_value = response
    client = OllamaEmbeddingClient(settings, session)
    assert client(["texto"]) == [[1, 2]]
    session.post.assert_called_once_with(
        "http://ollama:11434/api/embed",
        json={"model": "nomic-embed-text", "input": ["texto"], "truncate": False},
        timeout=(2.0, 120.0),
        allow_redirects=False,
    )
    assert session.trust_env is False
    response.close.assert_called_once()
    client.close()
    session.close.assert_called_once()


@pytest.mark.parametrize("failure", [requests.Timeout, requests.ConnectionError])
def test_embedding_failure_is_not_retried_or_exposed(settings, session, failure):
    session.post.side_effect = failure("secret upstream document")
    with pytest.raises(OllamaUnavailable) as error:
        OllamaEmbeddingClient(settings, session)(["texto"])
    assert "secret" not in str(error.value)
    assert error.value.__suppress_context__
    session.post.assert_called_once()


@pytest.mark.parametrize("status", [302, 400, 404, 429, 500, 503])
def test_embedding_http_errors_do_not_retry(settings, session, http_response, status):
    session.post.return_value = http_response(status=status)
    with pytest.raises(OllamaUnavailable):
        OllamaEmbeddingClient(settings, session)(["texto"])
    session.post.assert_called_once()
    session.post.return_value.close.assert_called_once()


@pytest.mark.parametrize(
    "payload", [None, [], {}, {"embeddings": None}, {"embeddings": [], "error": "private"}]
)
def test_malformed_embedding_responses(settings, session, http_response, payload):
    session.post.return_value = http_response(payload)
    with pytest.raises(OllamaUnavailable):
        OllamaEmbeddingClient(settings, session)(["texto"])


def test_non_json_embedding_response(settings, session, http_response):
    session.post.return_value = http_response()
    session.post.return_value.json = Mock(side_effect=ValueError("private body"))
    with pytest.raises(OllamaUnavailable, match="Invalid embedding response"):
        OllamaEmbeddingClient(settings, session)(["texto"])
