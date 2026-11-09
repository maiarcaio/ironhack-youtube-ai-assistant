
"""LangChain tools for the VideoMind AI assistant."""

import json
import re

from langchain_core.tools import BaseTool, tool

from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from app.services.persistence.video_repository import get_video
from app.services.retrieval.vector_store import get_vector_store


def _evidence(document: object) -> dict:
    """Convert a retrieved document into traceable evidence."""
    return {
        "chunk_id": document.metadata.get("chunk_id"),
        "content": document.page_content[:1000],
        "start_seconds": document.metadata.get("start_seconds"),
        "end_seconds": document.metadata.get("end_seconds"),
    }


def _search(
    video_id: str,
    owner_id: str,
    query: str,
    limit: int = 3,
    extra_filter: dict | None = None,
) -> list[dict]:
    """Search Pinecone within the authenticated video scope."""

    filters = {
        "video_id": {"$eq": video_id},
        "owner_id": {"$eq": owner_id},
    }

    if extra_filter:
        filters.update(extra_filter)

    documents = get_vector_store().similarity_search(
        query=query[:500],
        k=limit,
        filter=filters,
    )

    return [_evidence(doc) for doc in documents]


def _cached_transcript(
    video_id: str,
    owner_id: str,
) -> dict | None:
    """Retrieve a transcript restricted to its owner."""

    response = (
        get_supabase_admin_client()
        .table("transcripts")
        .select("content,format")
        .eq("video_id", video_id)
        .eq("owner_id", owner_id)
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None


def create_video_search_tool(
    video_id: str,
    owner_id: str,
) -> BaseTool:

    @tool
    def search_video_transcript(query: str) -> str:
        """Search the selected video's content for factual evidence."""

        if not query.strip():
            return json.dumps({"error": "Query is required."})

        results = _search(video_id, owner_id, query)

        return json.dumps({
            "video_id": video_id,
            "results": results,
        }, ensure_ascii=False)

    return search_video_transcript


def create_video_metadata_tool(
    video_id: str,
    owner_id: str,
) -> BaseTool:

    @tool
    def get_video_metadata() -> str:
        """Retrieve title, URL, source type and processing status."""

        video = get_video(
            owner_id=owner_id,
            video_id=video_id,
        )

        if video is None:
            return json.dumps({"error": "Video not found."})

        return json.dumps({
            "video_id": video_id,
            "title": video.get("title"),
            "source_url": video.get("source_url"),
            "source_type": video.get("source_type"),
            "status": video.get("status"),
        }, ensure_ascii=False)

    return get_video_metadata


def create_video_moments_tool(
    video_id: str,
    owner_id: str,
) -> BaseTool:

    @tool
    def find_video_moments(
        query: str,
        start_seconds: float,
        end_seconds: float,
    ) -> str:
        """Find relevant evidence within a specified video time range."""

        if (
            not query.strip()
            or start_seconds < 0
            or end_seconds <= start_seconds
        ):
            return json.dumps({
                "error": "Invalid query or time range."
            })

        results = _search(
            video_id,
            owner_id,
            query,
            limit=5,
            extra_filter={
                "start_seconds": {"$lte": end_seconds},
                "end_seconds": {"$gte": start_seconds},
            },
        )

        return json.dumps({
            "video_id": video_id,
            "results": results,
        }, ensure_ascii=False)

    return find_video_moments


def create_topic_comparison_tool(
    video_id: str,
    owner_id: str,
) -> BaseTool:

    @tool
    def compare_video_topics(
        topic_a: str,
        topic_b: str,
    ) -> str:
        """Retrieve evidence for comparing two topics in one video."""

        if not topic_a.strip() or not topic_b.strip():
            return json.dumps({
                "error": "Both topics are required."
            })

        return json.dumps({
            "video_id": video_id,
            "topic_a": {
                "name": topic_a,
                "results": _search(
                    video_id, owner_id, topic_a, limit=3
                ),
            },
            "topic_b": {
                "name": topic_b,
                "results": _search(
                    video_id, owner_id, topic_b, limit=3
                ),
            },
        }, ensure_ascii=False)

    return compare_video_topics


def create_exact_phrase_tool(
    video_id: str,
    owner_id: str,
) -> BaseTool:

    @tool
    def find_exact_transcript_phrase(phrase: str) -> str:
        """Find literal phrases in a cached video transcript."""

        phrase = phrase.strip()

        if not 2 <= len(phrase) <= 100:
            return json.dumps({
                "error": "Phrase must contain 2-100 characters."
            })

        transcript = _cached_transcript(video_id, owner_id)

        if transcript is None:
            return json.dumps({
                "available": False,
                "message": "No cached transcript is available.",
            })

        content = transcript.get("content") or ""

        matches = []

        for match in re.finditer(
            re.escape(phrase),
            content,
            flags=re.IGNORECASE,
        ):
            start = max(0, match.start() - 100)
            end = min(len(content), match.end() + 100)

            matches.append({
                "excerpt": content[start:end],
            })

            if len(matches) >= 5:
                break

        return json.dumps({
            "video_id": video_id,
            "phrase": phrase,
            "matches": matches,
        }, ensure_ascii=False)

    return find_exact_transcript_phrase


def create_transcript_overview_tool(
    video_id: str,
    owner_id: str,
) -> BaseTool:

    @tool
    def get_transcript_overview() -> str:
        """Return statistics for an available cached transcript."""

        transcript = _cached_transcript(video_id, owner_id)

        if transcript is None:
            return json.dumps({
                "available": False,
                "message": "No cached transcript is available.",
            })

        content = transcript.get("content") or ""

        return json.dumps({
            "video_id": video_id,
            "available": True,
            "format": transcript.get("format"),
            "characters": len(content),
            "words": len(content.split()),
            "subtitle_cues": content.count("-->"),
        }, ensure_ascii=False)

    return get_transcript_overview
