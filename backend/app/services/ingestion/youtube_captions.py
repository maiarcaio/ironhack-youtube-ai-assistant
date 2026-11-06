
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlsplit

from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    RequestBlocked,
    YouTubeTranscriptApi,
)

from app.services.ingestion.pipeline import ingest_transcript


VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
}

SHORT_HOSTS = {
    "youtu.be",
    "www.youtu.be",
}

EMBED_HOSTS = {
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}

PREFERRED_LANGUAGES = ["pt", "pt-BR", "en", "es"]
MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024


def extract_youtube_video_id(url: str) -> str:
    """Extract a validated YouTube video ID from a URL."""

    parsed = urlsplit(url.strip())
    host = (parsed.hostname or "").lower()
    path_parts = parsed.path.strip("/").split("/")

    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Invalid YouTube URL.")

    if host in SHORT_HOSTS:
        video_id = path_parts[0]

    elif host in YOUTUBE_HOSTS:
        if parsed.path == "/watch":
            video_id = parse_qs(
                parsed.query
            ).get("v", [""])[0]

        elif path_parts[0] in {
            "shorts", "live", "embed"
        } and len(path_parts) >= 2:
            video_id = path_parts[1]

        else:
            raise ValueError(
                "Unsupported YouTube URL format."
            )

    elif host in EMBED_HOSTS:
        if path_parts[0] != "embed" or len(path_parts) < 2:
            raise ValueError("Invalid YouTube embed URL.")

        video_id = path_parts[1]

    else:
        raise ValueError("URL is not from YouTube.")

    if not VIDEO_ID_PATTERN.fullmatch(video_id):
        raise ValueError("Invalid YouTube video ID.")

    return video_id


def format_srt_timestamp(seconds: float) -> str:
    """Convert seconds to SRT timestamp format."""

    milliseconds = round(seconds * 1000)

    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)

    return (
        f"{hours:02}:{minutes:02}:"
        f"{secs:02},{millis:03}"
    )


def ingest_youtube_captions(
    url: str,
    owner_id: str,
    transcript_api=None,
) -> dict:
    """
    Retrieve available captions and index them using
    the existing transcript ingestion pipeline.

    This experimental adapter is intended for
    authorized local development.
    """

    video_id = extract_youtube_video_id(url)

    if not owner_id.strip():
        raise ValueError("Owner ID is required.")

    api = transcript_api or YouTubeTranscriptApi()

    try:
        captions = api.fetch(
            video_id,
            languages=PREFERRED_LANGUAGES,
        )

    except RequestBlocked as exc:
        raise RuntimeError(
            "YouTube blocked transcript access. "
            "Use TXT, SRT or VTT upload instead."
        ) from exc

    except CouldNotRetrieveTranscript as exc:
        raise RuntimeError(
            "No accessible transcript was found. "
            "Use TXT, SRT or VTT upload instead."
        ) from exc

    srt_blocks = []

    for caption in captions:
        text = " ".join(caption.text.split())
        start = float(caption.start)
        duration = float(caption.duration)

        if not text or duration <= 0 or start < 0:
            continue

        end = start + duration

        srt_blocks.append(
            f"{len(srt_blocks) + 1}\n"
            f"{format_srt_timestamp(start)} --> "
            f"{format_srt_timestamp(end)}\n"
            f"{text}"
        )

    if not srt_blocks:
        raise ValueError(
            "The transcript contains no valid segments."
        )

    srt_content = "\n\n".join(srt_blocks) + "\n"

    if len(srt_content.encode("utf-8")) > MAX_TRANSCRIPT_BYTES:
        raise ValueError(
            "Transcript exceeds the 2 MB limit."
        )

    # Reuse our working SRT ingestion pipeline.
    with TemporaryDirectory() as folder:
        file_path = Path(folder) / "youtube_transcript.srt"
        file_path.write_text(
            srt_content,
            encoding="utf-8",
        )

        chunks_count = ingest_transcript(
            file_path=str(file_path),
            video_id=video_id,
            owner_id=owner_id,
        )

    return {
        "video_id": video_id,
        "status": "completed",
        "chunks_count": chunks_count,
    }
