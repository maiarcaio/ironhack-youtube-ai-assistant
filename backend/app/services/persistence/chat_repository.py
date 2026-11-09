
"""Persistent conversation history for VideoMind AI."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)


def get_or_create_thread(
    owner_id: str,
    video_id: str,
    thread_id: str | None = None,
) -> str:
    """Create a conversation or verify ownership of an existing one."""

    client = get_supabase_admin_client()

    if thread_id is not None:
        if not 1 <= len(thread_id) <= 128:
            raise HTTPException(
                status_code=422,
                detail="Invalid thread ID.",
            )

        result = (
            client.table("chat_threads")
            .select("id")
            .eq("id", thread_id)
            .eq("owner_id", owner_id)
            .eq("video_id", video_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        return thread_id

    new_thread_id = str(uuid4())

    client.table("chat_threads").insert({
        "id": new_thread_id,
        "owner_id": owner_id,
        "video_id": video_id,
    }).execute()

    return new_thread_id


def load_conversation_history(
    owner_id: str,
    thread_id: str,
    limit: int = 20,
) -> list[dict]:
    """Load recent messages in chronological order."""

    result = (
        get_supabase_admin_client()
        .table("chat_messages")
        .select("role,content")
        .eq("owner_id", owner_id)
        .eq("thread_id", thread_id)
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )

    return [
        {
            "role": row["role"],
            "content": row["content"],
        }
        for row in reversed(result.data or [])
    ]


def save_conversation_turn(
    owner_id: str,
    video_id: str,
    thread_id: str,
    question: str,
    answer: str,
    sources: list[dict],
) -> None:
    """Persist a complete question-answer exchange."""

    client = get_supabase_admin_client()

    # Verify the thread belongs to this user and video.
    get_or_create_thread(
        owner_id=owner_id,
        video_id=video_id,
        thread_id=thread_id,
    )

    client.table("chat_messages").insert([
        {
            "thread_id": thread_id,
            "owner_id": owner_id,
            "role": "user",
            "content": question,
            "sources": [],
        },
        {
            "thread_id": thread_id,
            "owner_id": owner_id,
            "role": "assistant",
            "content": answer,
            "sources": sources,
        },
    ]).execute()

    client.table("chat_threads").update({
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq(
        "id", thread_id
    ).eq(
        "owner_id", owner_id
    ).execute()
