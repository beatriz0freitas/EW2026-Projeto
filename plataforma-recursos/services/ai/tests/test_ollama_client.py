from unittest.mock import Mock

import pytest
import requests

from app.ollama_client import OllamaClient, OllamaUnavailable


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
def test_transient_errors_retry_with_bound_and_timeout(settings, session, http_response, status):
    sleep = Mock()
    first = http_response(status=status)
    second = http_response({"models": [{"name": "nomic-embed-text"}]})
    session.get.side_effect = [first, second]
    client = OllamaClient(settings, session=session, sleep=sleep)
    assert client.available_models() == {"nomic-embed-text:latest"}
    assert session.get.call_count == 2
    sleep.assert_called_once_with(0.25)
    session.get.assert_called_with(
        "http://ollama:11434/api/tags", timeout=(2.0, 5.0), allow_redirects=False
    )
    first.close.assert_called_once()
    second.close.assert_called_once()
    assert session.trust_env is False


@pytest.mark.parametrize("status", [301, 302, 400, 401, 403, 404])
def test_permanent_errors_and_redirects_are_not_retried(settings, session, http_response, status):
    sleep = Mock()
    session.get.return_value = http_response(status=status)
    with pytest.raises(OllamaUnavailable):
        OllamaClient(settings, session=session, sleep=sleep).available_models()
    session.get.assert_called_once()
    sleep.assert_not_called()


@pytest.mark.parametrize("failure", [requests.Timeout, requests.ConnectionError])
def test_transport_failures_exhaust_attempts(settings, session, failure):
    sleep = Mock()
    session.get.side_effect = failure("secret upstream detail")
    with pytest.raises(OllamaUnavailable, match="^Ollama unavailable$"):
        OllamaClient(settings, session=session, sleep=sleep).loaded_models()
    assert session.get.call_count == 2
    sleep.assert_called_once()


def test_exhausted_http_errors(settings, session, http_response):
    session.get.return_value = http_response(status=503)
    with pytest.raises(OllamaUnavailable):
        OllamaClient(settings, session=session, sleep=Mock()).available_models()
    assert session.get.call_count == 2


@pytest.mark.parametrize("payload", [[], {}, {"error": "secret"}, {"models": None},
                                     {"models": [{}]}, {"models": [{"name": 1}]}])
def test_invalid_payloads_fail_without_retry(settings, session, http_response, payload):
    session.get.return_value = http_response(payload)
    with pytest.raises(OllamaUnavailable):
        OllamaClient(settings, session=session).available_models()
    session.get.assert_called_once()


def test_non_json_response(settings, session, http_response):
    session.get.return_value = http_response()
    session.get.return_value.json.side_effect = ValueError("secret response body")
    with pytest.raises(OllamaUnavailable, match="^Invalid Ollama response$"):
        OllamaClient(settings, session=session).loaded_models()
    session.get.assert_called_once()
