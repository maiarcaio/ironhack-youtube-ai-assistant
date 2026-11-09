
"""Recover ingestion jobs abandoned by interrupted workers."""

from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from app.services.persistence.video_repository import (
    update_video_status,
)


def recover_stale_jobs(
    *,
    minimum_age_minutes: int = 60,
    max_attempts: int = 3,
    apply: bool = False,
) -> list[dict[str, Any]]:
    """
    Find or recover abandoned processing jobs.

    Dry-run by default. Apply only when all ingestion
    workers have been stopped.
    """

    if minimum_age_minutes < 1 or max_attempts < 1:
        raise ValueError("Recovery limits must be positive.")

    now = datetime.now(timezone.utc)
    cutoff = (
        now - timedelta(minutes=minimum_age_minutes)
    ).isoformat()

    client = get_supabase_admin_client()

    response = (
        client.table("ingestion_jobs")
        .select(
            "id,video_id,owner_id,attempts,started_at"
        )
        .eq("status", "processing")
        .lt("started_at", cutoff)
        .order("started_at")
        .limit(100)
        .execute()
    )

    results = []

    for job in response.data or []:
        attempts = int(job["attempts"])

        next_status = (
            "failed"
            if attempts >= max_attempts
            else "queued"
        )

        result = {
            "job_id": job["id"],
            "video_id": job["video_id"],
            "attempts": attempts,
            "next_status": next_status,
            "recovered": False,
        }

        if not apply:
            results.append(result)
            continue

        message = (
            "Processing interrupted. Retry scheduled."
            if next_status == "queued"
            else "Processing stopped after maximum attempts."
        )

        delay_seconds = (
            min(30 * (2 ** max(attempts - 1, 0)), 300)
            if next_status == "queued"
            else 0
        )

        available_at = (
            now + timedelta(seconds=delay_seconds)
        ).isoformat()

        updated = (
            client.table("ingestion_jobs")
            .update({
                "status": next_status,
                "last_error": message,
                "started_at": None,
                "finished_at": (
                    now.isoformat()
                    if next_status == "failed"
                    else None
                ),
                "available_at": available_at,
            })
            .eq("id", job["id"])
            .eq("status", "processing")
            .eq("started_at", job["started_at"])
            .eq("attempts", attempts)
            .execute()
        )

        if not updated.data:
            results.append(result)
            continue

        video = update_video_status(
            owner_id=job["owner_id"],
            video_id=job["video_id"],
            new_status=next_status,
            error=(
                message
                if next_status == "failed"
                else None
            ),
        )

        if video is None:
            raise RuntimeError(
                f"Could not synchronize video {job['video_id']}."
            )

        result["recovered"] = True
        results.append(result)

    return results
