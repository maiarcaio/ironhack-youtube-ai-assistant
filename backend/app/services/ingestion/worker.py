
"""Background ingestion worker for VideoMind AI."""

import logging
from datetime import datetime, timezone
from typing import Any

from app.services.ingestion.youtube_captions import (
    ingest_youtube_captions,
)
from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from app.services.persistence.video_repository import (
    get_video,
    update_video_status,
)
from app.services.persistence.worker_queue import (
    claim_next_job,
)


logger = logging.getLogger(__name__)


def _finish_job(
    job_id: str,
    status: str,
    error: str | None = None,
) -> None:
    """Persist the final status of an ingestion job."""

    response = (
        get_supabase_admin_client()
        .table("ingestion_jobs")
        .update(
            {
                "status": status,
                "finished_at": datetime.now(
                    timezone.utc
                ).isoformat(),
                "last_error": error,
            }
        )
        .eq("id", job_id)
        .eq("status", "processing")
        .execute()
    )

    if not response.data:
        raise RuntimeError(
            "Could not finalize the ingestion job."
        )


def process_next_job() -> dict[str, Any] | None:
    """
    Reserve and process one pending YouTube video.

    Returns None when no pending job exists.
    """

    job = claim_next_job()

    if job is None:
        return None

    job_id = str(job["id"])
    video_id = str(job["video_id"])
    owner_id = str(job["owner_id"])

    logger.info("Processing ingestion job %s", job_id)

    try:
        video = get_video(
            owner_id=owner_id,
            video_id=video_id,
        )

        if video is None:
            raise ValueError(
                "Video record not found."
            )

        if (
            video.get("source_type") != "youtube"
            or not video.get("source_url")
        ):
            raise ValueError(
                "Invalid YouTube ingestion job."
            )

        updated = update_video_status(
            owner_id=owner_id,
            video_id=video_id,
            new_status="processing",
        )

        if updated is None:
            raise RuntimeError(
                "Could not update video status."
            )

        result = ingest_youtube_captions(
            url=video["source_url"],
            owner_id=owner_id,
            library_video_id=video_id,
        )

        if result["video_id"] != video_id:
            raise RuntimeError(
                "Ingestion video ID mismatch."
            )

        _finish_job(
            job_id=job_id,
            status="completed",
        )

        update_video_status(
            owner_id=owner_id,
            video_id=video_id,
            new_status="completed",
        )

        logger.info(
            "Ingestion completed for video %s",
            video_id,
        )

        return {
            "video_id": video_id,
            "status": "completed",
            "chunks_count": result["chunks_count"],
        }

    except Exception as exc:
        logger.exception(
            "Ingestion failed for video %s",
            video_id,
        )

        if isinstance(exc, (ValueError, RuntimeError)):
            error_message = (
                "Could not process YouTube captions. "
                "Upload a TXT, SRT or VTT transcript instead."
            )
        else:
            error_message = (
                "Video processing failed. "
                "Please try again later."
            )

        # Persist the failure. If the database is unavailable,
        # propagate the error so an operator can investigate.
        update_video_status(
            owner_id=owner_id,
            video_id=video_id,
            new_status="failed",
            error=error_message,
        )

        _finish_job(
            job_id=job_id,
            status="failed",
            error=error_message,
        )

        return {
            "video_id": video_id,
            "status": "failed",
            "error": error_message,
        }
