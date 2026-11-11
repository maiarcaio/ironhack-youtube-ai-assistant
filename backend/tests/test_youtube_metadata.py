"""YouTube metadata lookup regressions (no network access)."""

from types import SimpleNamespace

import httpx

from app.services.ingestion import youtube_metadata


def test_youtube_title(monkeypatch):
    def fake_get(url, **kwargs):
        assert url == youtube_metadata.OEMBED_URL
        assert kwargs["params"]["url"].endswith("jNQXAC9IVRw")
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"title": "  A real   title  "},
        )

    monkeypatch.setattr(youtube_metadata.httpx, "get", fake_get)
    assert youtube_metadata.fetch_youtube_title("jNQXAC9IVRw") == "A real title"


def test_invalid_video_id_never_fetches(monkeypatch):
    monkeypatch.setattr(
        youtube_metadata.httpx, "get",
        lambda *a, **kw: (_ for _ in ()).throw(AssertionError("HTTP called")),
    )
    assert youtube_metadata.fetch_youtube_title("invalid") is None


def test_provider_failure_is_non_blocking(monkeypatch):
    monkeypatch.setattr(
        youtube_metadata.httpx, "get",
        lambda *a, **kw: (_ for _ in ()).throw(httpx.TimeoutException("timeout")),
    )
    assert youtube_metadata.fetch_youtube_title("jNQXAC9IVRw") is None
