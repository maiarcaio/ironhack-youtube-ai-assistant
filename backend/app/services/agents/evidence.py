
"""Extract verified evidence from LangChain tool results."""

import json


EVIDENCE_TOOLS = {
    "search_video_transcript",
    "find_video_moments",
    "compare_video_topics",
}


def extract_tool_sources(
    tool_name: str | None,
    content: str,
    video_id: str,
) -> list[dict]:
    """Extract video-specific evidence from supported tools."""

    if tool_name not in EVIDENCE_TOOLS:
        return []

    try:
        payload = json.loads(content)
    except (TypeError, ValueError):
        return []

    if not isinstance(payload, dict):
        return []

    if payload.get("video_id") != video_id:
        return []

    if tool_name == "compare_video_topics":
        results = []

        for key in ("topic_a", "topic_b"):
            topic = payload.get(key, {})

            if isinstance(topic, dict):
                results.extend(topic.get("results", []))
    else:
        results = payload.get("results", [])

    if not isinstance(results, list):
        return []

    sources = []

    for item in results:
        if not isinstance(item, dict):
            continue

        chunk_id = item.get("chunk_id")

        if not isinstance(chunk_id, str) or not chunk_id:
            continue

        sources.append({
            "chunk_id": chunk_id,
            "excerpt": str(item.get("content", ""))[:1000],
            "start_seconds": item.get("start_seconds"),
            "end_seconds": item.get("end_seconds"),
            "source_type": "transcript",
        })

    return sources
