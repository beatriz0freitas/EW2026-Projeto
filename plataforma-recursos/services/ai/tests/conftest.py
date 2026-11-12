from unittest.mock import Mock

import pytest
import requests

from app.config import Settings


@pytest.fixture
def settings():
    return Settings(internal_service_token="test-internal-token")


@pytest.fixture
def session():
    return Mock(spec=requests.Session)


@pytest.fixture
def http_response():
    def make(payload=None, status=200):
        response = Mock(spec=requests.Response)
        response.status_code = status
        response.json.return_value = payload
        return response

    return make
