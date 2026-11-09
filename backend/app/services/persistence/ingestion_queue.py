
"""Queue video ingestion jobs in Supabase."""

import logging
from typing import Any

from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from app.services.persistence.video_repository import (
    create_video,
)

logger = logging.getLogger(__name__)


def enqueue_youtube_video(
    owner_id: str,
    source_url: str,
    youtube_video_id: str | None = None,
    title: str = "YouTube video",
) -> dict[str, Any]:
    """
    Register a YouTube video and its ingestion job.

    The owner ID must come from verified authentication.
    No actual processing is performed here.
    """

    # 1. Create the video record.
    video = create_video(
        owner_id=owner_id,
        source_type="youtube",
        title=title,
        source_url=source_url,
        youtube_video_id=youtube_video_id,
    )

    video_id = video["video_id"]
    verified_owner_id = video["owner_id"]

    client = get_supabase_admin_client()

    try:
        # 2. Add a job to the processing queue.
        client.table("ingestion_jobs").insert(
            {
                "video_id": video_id,
                "owner_id": verified_owner_id,
                "status": "queued",
            }
        ).execute()

    except Exception:
        # Best-effort cleanup if job registration fails.
        try:
            client.table("videos").delete().eq(
                "video_id", video_id
            ).eq(
                "owner_id", verified_owner_id
            ).execute()

        except Exception:
            logger.exception(
                "Could not clean up video %s after queue failure.",
                video_id,
            )

        raise

    return {
        "video_id": video_id,
        "status": "queued",
    }
