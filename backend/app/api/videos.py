
"""Video ingestion, status and library API routes."""

import re
from typing import Annotated
from urllib.parse import parse_qs, urlsplit

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.auth import get_current_user_id
from app.schemas.video import (
    IngestVideoRequest,
    IngestVideoResponse,
    VideoListResponse,
    VideoStatusResponse,
)
from app.services.persistence.ingestion_queue import (
    enqueue_youtube_video,
)
from app.services.persistence.video_repository import (
    get_video,
    list_videos as fetch_user_videos,
)


router = APIRouter(
    prefix="/api/v1/videos",
    tags=["Videos"],
)

CurrentUserId = Annotated[str, Depends(get_current_user_id)]

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
}

YOUTUBE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_youtube_video_id(url: str) -> str:
    """Validate a YouTube URL and extract its video ID."""

    parsed = urlsplit(url)

    if (
        parsed.scheme != "https"
        or parsed.hostname not in YOUTUBE_HOSTS
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("A valid HTTPS YouTube URL is required.")

    hostname = parsed.hostname or ""

    if hostname in {"youtu.be", "www.youtu.be"}:
        video_id = parsed.path.strip("/")

    elif parsed.path == "/watch":
        video_id = parse_qs(parsed.query).get("v", [""])[0]

    elif parsed.path.startswith(("/shorts/", "/live/", "/embed/")):
        parts = parsed.path.strip("/").split("/")
        video_id = parts[1] if len(parts) == 2 else ""

    else:
        video_id = ""

    if not YOUTUBE_ID_PATTERN.fullmatch(video_id):
        raise ValueError("Could not extract a valid YouTube video ID.")

    return video_id


@router.post(
    "/ingest",
    response_model=IngestVideoResponse,
    status_code=status.HTTP_202_ACCEPTED,
)

def ingest_video(
    request: IngestVideoRequest,
    owner_id: CurrentUserId,
):
    """Register an authenticated YouTube ingestion request."""

    source_url = str(request.url)

    try:
        youtube_video_id = extract_youtube_video_id(source_url)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    result = enqueue_youtube_video(
        owner_id=owner_id,
        source_url=source_url,
        youtube_video_id=youtube_video_id,
    )

    return IngestVideoResponse(**result)


@router.get(
    "/{video_id}/status",
    response_model=VideoStatusResponse,
)

def get_video_status(
    video_id: str,
    owner_id: CurrentUserId,
):
    """Get the processing status of a user's video."""

    video = get_video(
        owner_id=owner_id,
        video_id=video_id,
    )

    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found.",
        )

    return VideoStatusResponse(
        video_id=video["video_id"],
        status=video["status"],
        error=video.get("error"),
    )


@router.get(
    "",
    response_model=VideoListResponse,
)


def list_videos(
    owner_id: CurrentUserId,
):
    """List videos belonging to the authenticated user."""

    videos = fetch_user_videos(owner_id=owner_id)

    return VideoListResponse(videos=videos)
