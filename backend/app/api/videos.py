
"""Video ingestion, status and library API routes."""

import re
import logging
from pathlib import Path
from uuid import uuid4
from typing import Annotated
from urllib.parse import parse_qs, urlsplit

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Query
from fastapi.concurrency import run_in_threadpool

from app.api.auth import get_current_user_id
from app.schemas.video import (
    IngestVideoRequest,
    IngestVideoResponse,
    VideoListResponse,
    VideoStatusResponse,
)
from app.services.persistence.ingestion_queue import (
    enqueue_youtube_video, enqueue_upload_video,
)
from app.services.ingestion.storage_media import (
    MAX_MEDIA_BYTES, validate_media, store_media, remove_media, signed_playback,
)
from app.services.ingestion.moments import get_video_moments
logger = logging.getLogger(__name__)
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


@router.post("/upload", response_model=IngestVideoResponse,
             status_code=status.HTTP_202_ACCEPTED)
async def upload_media(owner_id: CurrentUserId, file: UploadFile = File(...)):
    """Upload authorized media to private Storage, then queue transcription."""
    filename = Path(file.filename or "").name
    content = await file.read(MAX_MEDIA_BYTES + 1)
    await file.close()
    if len(content) > MAX_MEDIA_BYTES:
        raise HTTPException(413, "Media exceeds the 24 MB limit.")
    try:
        validate_media(filename, content)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    video_id = str(uuid4())
    try:
        uri = await run_in_threadpool(store_media, owner_id, video_id, filename, content)
    except Exception as exc:
        logger.exception("Media storage failed")
        raise HTTPException(503, "Private media storage unavailable.") from exc

    try:
        result = await run_in_threadpool(
            enqueue_upload_video, owner_id, uri, filename[:120], video_id,
        )
    except Exception as exc:
        logger.exception("Could not queue media %s", video_id)
        try:
            await run_in_threadpool(remove_media, uri, owner_id, video_id)
        except Exception:
            logger.exception("Could not clean up unqueued media %s", video_id)
        raise HTTPException(503, "Media queue unavailable.") from exc
    return IngestVideoResponse(**result)


@router.get("/{video_id}/playback")
def get_media_playback(video_id: str, owner_id: CurrentUserId):
    """Private upload playback: signed URLs expire after one hour."""
    video = get_video(owner_id=owner_id, video_id=video_id)
    if video is None or video.get("source_type") != "upload":
        raise HTTPException(404, "Uploaded media not found.")
    try:
        return signed_playback(video)
    except Exception as exc:
        logger.exception("Could not sign media playback %s", video_id)
        raise HTTPException(503, "Media playback unavailable.") from exc


@router.get("/{video_id}/moments")
def list_video_moments(
    video_id: str, owner_id: CurrentUserId,
    limit: int = Query(default=30, ge=1, le=80),
):
    """Real subtitle moments, never AI-estimated timestamps."""
    video = get_video(owner_id=owner_id, video_id=video_id)
    if video is None:
        raise HTTPException(404, "Video not found.")
    if video.get("status") != "completed":
        raise HTTPException(409, "Video is not ready.")
    return {"video_id": video_id,
            "moments": get_video_moments(owner_id, video_id, limit)}
