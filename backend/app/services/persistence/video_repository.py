
"""Persistence operations for VideoMind AI videos."""

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)


VideoStatus = Literal[
    "queued",
    "processing",
    "completed",
    "failed",
]

SourceType = Literal["youtube", "upload"]


def _validate_owner_id(owner_id: str) -> str:
    """Validate the format of an authenticated user's ID."""
    return str(UUID(owner_id))


def create_video(
    owner_id: str,
    source_type: SourceType,
    title: str = "Untitled video",
    source_url: str | None = None,
    youtube_video_id: str | None = None,
    video_id: str | None = None,
) -> dict[str, Any]:
    """Create a video record with queued status."""

    owner_id = _validate_owner_id(owner_id)

    payload = {
        "video_id": video_id or str(uuid4()),
        "owner_id": owner_id,
        "title": title,
        "source_type": source_type,
        "source_url": source_url,
        "youtube_video_id": youtube_video_id,
        "status": "queued",
    }

    response = (
        get_supabase_admin_client()
        .table("videos")
        .insert(payload)
        .execute()
    )

    return response.data[0]


def get_video(
    owner_id: str,
    video_id: str,
) -> dict[str, Any] | None:
    """Retrieve one video belonging to the authenticated user."""

    owner_id = _validate_owner_id(owner_id)

    response = (
        get_supabase_admin_client()
        .table("videos")
        .select("*")
        .eq("owner_id", owner_id)
        .eq("video_id", video_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None


def list_videos(
    owner_id: str,
    archived: bool = False,
) -> list[dict[str, Any]]:
    """List the authenticated user's videos, newest first."""

    owner_id = _validate_owner_id(owner_id)

    response = (
        get_supabase_admin_client()
        .table("videos")
        .select("video_id,title,status,source_url,archived_at")
        .eq("owner_id", owner_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )

    return [
        video for video in (response.data or [])
        if (video.get("archived_at") is not None) == archived
    ]


def update_video_status(
    owner_id: str,
    video_id: str,
    new_status: VideoStatus,
    error: str | None = None,
) -> dict[str, Any] | None:
    """Update the status of a video owned by the user."""

    owner_id = _validate_owner_id(owner_id)

    response = (
        get_supabase_admin_client()
        .table("videos")
        .update({
            "status": new_status,
            "error": error,
        })
        .eq("owner_id", owner_id)
        .eq("video_id", video_id)
        .execute()
    )

    return response.data[0] if response.data else None



def set_video_archived(
    owner_id: str,
    video_id: str,
    archived: bool,
) -> dict[str, Any] | None:
    """Archive or restore an owned, non-deleted video (without losing data)."""
    owner_id = _validate_owner_id(owner_id)

    existing = get_video(owner_id=owner_id, video_id=video_id)
    if existing is None:
        return None

    value = datetime.now(timezone.utc).isoformat() if archived else None
    response = (
        get_supabase_admin_client()
        .table("videos")
        .update({"archived_at": value})
        .eq("owner_id", owner_id)
        .eq("video_id", video_id)
        .is_("deleted_at", "null")
        .execute()
    )
    return response.data[0] if response.data else None


def soft_delete_video(
    owner_id: str,
    video_id: str,
) -> bool | None:
    """Hide a video without destroying vectors, storage, or relational data.

    Disallow deleting an active queued/processing job. Ownership and expected
    status are enforced again in the write condition to avoid races.
    Returns None when not found, False when still processing, True on success.
    """
    owner_id = _validate_owner_id(owner_id)
    existing = get_video(owner_id=owner_id, video_id=video_id)
    if existing is None:
        return None

    if existing["status"] in {"queued", "processing"}:
        return False

    response = (
        get_supabase_admin_client()
        .table("videos")
        .update({
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "archived_at": None,
        })
        .eq("owner_id", owner_id)
        .eq("video_id", video_id)
        .eq("status", existing["status"])
        .is_("deleted_at", "null")
        .execute()
    )
    if not response.data:
        return False
    return True
