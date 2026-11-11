"""Best-effort YouTube public metadata lookup (no API key required)."""

import logging
import re

import httpx


logger = logging.getLogger(__name__)
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
OEMBED_URL = "https://www.youtube.com/oembed"


def fetch_youtube_title(youtube_video_id: str) -> str | None:
    """Return a public video title or None; never block ingestion on metadata."""
    if not YOUTUBE_ID_RE.fullmatch(youtube_video_id):
        return None

    try:
        response = httpx.get(
            OEMBED_URL,
            params={
                "url": f"https://www.youtube.com/watch?v={youtube_video_id}",
                "format": "json",
            },
            timeout=3.0,
            follow_redirects=False,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("YouTube title unavailable for %s: %s", youtube_video_id, type(exc).__name__)
        return None

    title = payload.get("title") if isinstance(payload, dict) else None
    if not isinstance(title, str):
        return None

    title = " ".join(title.split())[:200]
    return title or None
