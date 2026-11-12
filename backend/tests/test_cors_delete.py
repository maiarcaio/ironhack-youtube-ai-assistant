"""Regression tests for browser preflight on authenticated library mutations.

These requests exercise FastAPI's actual CORS middleware without credentials,
database writes, or calls to production services.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app, cors_origins


@pytest.mark.parametrize("method", ["POST", "DELETE"])
def test_library_mutation_cors_preflight_allows_authenticated_browser(method):
    assert cors_origins, "At least one CORS origin is required for this test."
    origin = cors_origins[0]

    with TestClient(app) as client:
        response = client.options(
            "/api/v1/videos/test-video-id",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert response.status_code == 200, response.text
    assert response.headers["access-control-allow-origin"] == origin
    allowed = {
        value.strip()
        for value in response.headers["access-control-allow-methods"].split(",")
    }
    assert method in allowed
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_cors_preflight_does_not_allow_unconfigured_put():
    assert cors_origins
    origin = cors_origins[0]

    with TestClient(app) as client:
        response = client.options(
            "/api/v1/videos/test-video-id",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization",
            },
        )

    assert response.status_code == 400
