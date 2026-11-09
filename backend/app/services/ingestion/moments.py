"""Return verifiable moments from cached timed captions (no inferred times)."""

from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.ingestion.transcript_parser import load_timed_transcript
from app.services.persistence.supabase_client import get_supabase_admin_client


def get_video_moments(owner_id: str, video_id: str, limit: int = 30) -> list[dict]:
    result = (
        get_supabase_admin_client().table("transcripts")
        .select("content,format")
        .eq("owner_id", owner_id).eq("video_id", video_id)
        .limit(1).execute()
    )
    if not result.data:
        return []
    cached = result.data[0]
    fmt = cached.get("format")
    content = cached.get("content") or ""
    if fmt not in {"srt", "vtt"} or not content.strip():
        return []
    with TemporaryDirectory() as folder:
        path = Path(folder) / f"moments.{fmt}"
        path.write_text(content, encoding="utf-8")
        try:
            segments = load_timed_transcript(str(path))
        except ValueError:
            return []
    if not segments:
        return []
    step = max(30.0, segments[-1].end_seconds / max(1, limit))
    moments = []
    next_time = 0.0
    for segment in segments:
        if segment.start_seconds < next_time:
            continue
        moments.append({
            "start_seconds": segment.start_seconds,
            "end_seconds": segment.end_seconds,
            "text": segment.text[:180],
        })
        if len(moments) >= limit:
            break
        next_time = segment.start_seconds + step
    return moments
