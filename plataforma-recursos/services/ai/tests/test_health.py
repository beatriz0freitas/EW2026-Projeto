from unittest.mock import Mock, patch

import pytest
import requests
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.ollama_client import OllamaClient

HEADERS = {"X-Internal-Token": "test-internal-token"}


@pytest.fixture
def client(settings, session):
    ollama = OllamaClient(settings, session=session, sleep=Mock())
    with patch("app.main.OllamaClient", return_value=ollama) as factory:
        factory.canonical_model = OllamaClient.canonical_model
        with TestClient(create_app(settings)) as test_client:
            yield test_client
    session.close.assert_called_once()


def test_ready_distinguishes_installed_and_loaded(client, session, http_response):
    session.get.side_effect = [
        http_response({"models": [{"name": "llama3.2:1b"}, {"name": "nomic-embed-text:latest"}]}),
        http_response({"models": [{"name": "llama3.2:1b"}]}),
    ]
    response = client.get("/health", headers=HEADERS)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "status": "ok",
        "ollama": "reachable",
        "models": [
            {"name": "llama3.2:1b", "available": True, "loaded": True},
            {"name": "nomic-embed-text", "available": True, "loaded": False},
        ],
        "code": None,
    }
    assert [call.args[0] for call in session.get.call_args_list] == [
        "http://ollama:11434/api/tags", "http://ollama:11434/api/ps"
    ]


def test_installed_models_need_not_be_loaded(client, session, http_response):
    session.get.side_effect = [
        http_response({"models": [{"name": "llama3.2:1b"}, {"name": "nomic-embed-text:latest"}]}),
        http_response({"models": []}),
    ]
    response = client.get("/health", headers=HEADERS)
    assert response.status_code == 200
    assert all(not model["loaded"] for model in response.json()["models"])


@pytest.mark.parametrize("models", [[], [{"name": "llama3.2:1b"}]])
def test_missing_models_are_not_ready(client, session, http_response, models):
    session.get.side_effect = [http_response({"models": models}), http_response({"models": []})]
    response = client.get("/health", headers=HEADERS)
    assert response.status_code == 503
    assert response.json()["code"] == "MODELS_MISSING"
    assert response.json()["ollama"] == "reachable"


@pytest.mark.parametrize("failure", [requests.Timeout, requests.ConnectionError])
def test_ollama_failure_is_safe_and_liveness_survives(client, session, failure):
    session.get.side_effect = failure("private upstream token/path")
    response = client.get("/health", headers=HEADERS)
    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable", "ollama": "unavailable",
        "models": [], "code": "OLLAMA_UNAVAILABLE",
    }
    session.get.reset_mock()
    assert client.get("/live").json() == {"status": "ok"}
    session.get.assert_not_called()


def test_malformed_ollama_response_is_503(client, session, http_response):
    session.get.return_value = http_response({"models": "not-a-list"})
    response = client.get("/health", headers=HEADERS)
    assert response.status_code == 503
    assert response.json()["code"] == "OLLAMA_UNAVAILABLE"


@pytest.mark.parametrize("headers,status", [({}, 401), ({"X-Internal-Token": "wrong"}, 403)])
def test_authentication_precedes_ollama_calls(client, session, headers, status):
    assert client.get("/health", headers=headers).status_code == status
    session.get.assert_not_called()


def test_cluster_endpoint_requires_internal_authentication(client):
    assert client.post("/cluster", json={"allowed_ids": [], "nClusters": 2}).status_code == 401
    response = client.post(
        "/cluster",
        headers=HEADERS,
        json={"allowed_ids": [], "nClusters": 2},
    )
    assert response.status_code == 200
    assert response.json() == {"clusters": [], "indexVersion": "published"}


@pytest.mark.parametrize("path", ["/docs", "/openapi.json", "/search", "/ask", "/recommend"])
def test_no_placeholder_ai_or_documentation_routes(client, path):
    assert client.get(path).status_code == 404


def test_startup_fails_without_token(monkeypatch):
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    with pytest.raises(ValidationError), TestClient(create_app()):
        pass
