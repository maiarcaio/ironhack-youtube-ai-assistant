
"""Queue operations for background ingestion workers."""

from datetime import datetime, timezone
from typing import Any

from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)


def claim_next_job() -> dict[str, Any] | None:
    """
    Claim one available ingestion job.

    Only one worker can change a job from queued
    to processing. Returns None when no job is available.
    """

    client = get_supabase_admin_client()
    current_time = datetime.now(timezone.utc).isoformat()

    pending = (
        client.table("ingestion_jobs")
        .select("id,video_id,owner_id,attempts")
        .eq("status", "queued")
        .lte("available_at", current_time)
        .order("available_at")
        .limit(10)
        .execute()
    )

    for job in pending.data or []:
        claimed = (
            client.table("ingestion_jobs")
            .update(
                {
                    "status": "processing",
                    "attempts": int(job["attempts"]) + 1,
                    "started_at": current_time,
                    "finished_at": None,
                    "last_error": None,
                }
            )
            .eq("id", job["id"])
            .eq("status", "queued")
            .lte("available_at", current_time)
            .execute()
        )

        if claimed.data:
            return claimed.data[0]

    return None
