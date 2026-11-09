
"""Authenticated transcript upload and ingestion fallback."""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool

from app.api.auth import get_current_user_id
from app.schemas.transcript import TranscriptUploadResponse
from app.services.ingestion.upload import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
    ingest_uploaded_transcript,
)
from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from app.services.persistence.video_repository import (
    get_video,
    update_video_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/transcripts",
    tags=["Transcripts"],
)

CurrentUserId = Annotated[str, Depends(get_current_user_id)]


def _complete_fallback(
    owner_id: str,
    video_id: str,
    filename: str,
    content: bytes,
    transcript_text: str,
    transcript_format: str,
) -> int:
    """Index a failed video using an uploaded transcript."""

    video = get_video(owner_id=owner_id, video_id=video_id)

    if video is None:
        raise HTTPException(
            status_code=404,
            detail="Video not found.",
        )

    if video["status"] != "failed":
        raise HTTPException(
            status_code=409,
            detail="Transcript fallback requires a failed video.",
        )

    client = get_supabase_admin_client()

    # Reserve this video to prevent simultaneous uploads.
    claimed = (
        client.table("videos")
        .update({"status": "processing", "error": None})
        .eq("video_id", video_id)
        .eq("owner_id", owner_id)
        .eq("status", "failed")
        .execute()
    )

    if not claimed.data:
        raise HTTPException(
            status_code=409,
            detail="Video status changed. Please refresh.",
        )

    try:
        chunks_count = ingest_uploaded_transcript(
            filename=filename,
            content=content,
            video_id=video_id,
            owner_id=owner_id,
        )

        # Cache the transcript in Supabase.
        client.table("transcripts").upsert(
            {
                "video_id": video_id,
                "owner_id": owner_id,
                "content": transcript_text,
                "format": transcript_format,
                "source": "upload",
            },
            on_conflict="video_id",
        ).execute()

        # Complete the previously failed ingestion job.
        job_result = (
            client.table("ingestion_jobs")
            .update(
                {
                    "status": "completed",
                    "last_error": None,
                    "finished_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            )
            .eq("video_id", video_id)
            .eq("owner_id", owner_id)
            .eq("status", "failed")
            .execute()
        )

        if not job_result.data:
            raise RuntimeError(
                "Could not complete the ingestion job."
            )

        updated = update_video_status(
            owner_id=owner_id,
            video_id=video_id,
            new_status="completed",
        )

        if updated is None:
            raise RuntimeError(
                "Could not complete the video record."
            )

        return chunks_count

    except Exception as exc:
        logger.exception(
            "Transcript fallback failed for video %s",
            video_id,
        )

        # Best-effort rollback of processing states.
        try:
            update_video_status(
                owner_id=owner_id,
                video_id=video_id,
                new_status="failed",
                error="Transcript upload failed. Please try again.",
            )

            (
                client.table("ingestion_jobs")
                .update(
                    {
                        "status": "failed",
                        "last_error": "Transcript upload failed.",
                    }
                )
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .execute()
            )

        except Exception:
            logger.exception(
                "Could not restore failed state for %s",
                video_id,
            )

        if isinstance(exc, ValueError):
            raise HTTPException(
                status_code=400,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=503,
            detail="Transcript upload failed. Please try again.",
        ) from exc


@router.post(
    "/upload",
    response_model=TranscriptUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_transcript(
    video_id: Annotated[
        str,
        Form(min_length=1, max_length=128),
    ],
    file: Annotated[UploadFile, File()],
    owner_id: CurrentUserId,
):
    """Use an uploaded transcript to recover a failed video."""

    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Use a TXT, SRT or VTT file.",
        )

    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the 2 MB limit.",
        )

    try:
        transcript_text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="File must use UTF-8 encoding.",
        ) from exc

    if not transcript_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Transcript is empty.",
        )

    chunks_count = await run_in_threadpool(
        _complete_fallback,
        owner_id,
        video_id,
        filename,
        content,
        transcript_text,
        extension.lstrip("."),
    )

    return TranscriptUploadResponse(
        video_id=video_id,
        status="completed",
        chunks_count=chunks_count,
    )
