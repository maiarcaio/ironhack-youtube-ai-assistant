"""Private media storage and asynchronous transcription for user uploads."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from app.services.ingestion.audio_transcription import transcribe_audio_to_srt
from app.services.ingestion.upload import ingest_uploaded_transcript
from app.services.persistence.supabase_client import get_supabase_admin_client

MAX_MEDIA_BYTES = 24_000_000
MEDIA_FORMATS = {
    ".mp4": "video/mp4", ".webm": "video/webm",
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
    ".wav": "audio/wav", ".mpeg": "audio/mpeg", ".mpga": "audio/mpeg",
}


def _bucket() -> str:
    """Bucket must be private; never use an anonymous Supabase client."""
    bucket = os.getenv("VIDEOMIND_MEDIA_BUCKET", "videomind-videos").strip()
    if not bucket or "/" in bucket or ".." in bucket:
        raise RuntimeError("Invalid VIDEOMIND_MEDIA_BUCKET.")
    return bucket


def validate_media(filename: str, content: bytes) -> tuple[str, str]:
    """Validate size, extension and simple container signatures."""
    extension = Path(filename or "").suffix.lower()
    if extension not in MEDIA_FORMATS:
        raise ValueError("Use MP4, WebM, MP3, M4A or WAV.")
    if not content:
        raise ValueError("The uploaded media is empty.")
    if len(content) > MAX_MEDIA_BYTES:
        raise ValueError("The media exceeds the 24 MB limit.")
    if extension in {".mp4", ".m4a"} and content[4:8] != b"ftyp":
        raise ValueError("Invalid MP4/M4A header.")
    if extension == ".webm" and content[:4] != b"\x1a\x45\xdf\xa3":
        raise ValueError("Invalid WebM header.")
    if extension == ".wav" and not (content.startswith(b"RIFF") and content[8:12] == b"WAVE"):
        raise ValueError("Invalid WAV header.")
    return extension, MEDIA_FORMATS[extension]


def _parse_storage_uri(uri: str, owner_id: str, video_id: str) -> tuple[str, str]:
    parsed = urlsplit(uri)
    bucket = _bucket()
    key = parsed.path.lstrip("/")
    if (parsed.scheme != "storage" or parsed.netloc != bucket
            or not key.startswith(f"{owner_id}/{video_id}/")
            or ".." in key or parsed.query or parsed.fragment):
        raise ValueError("Invalid private media reference.")
    return bucket, key


def store_media(owner_id: str, video_id: str, filename: str, content: bytes) -> str:
    """Upload to a *private* Supabase Storage bucket. Return an internal URI."""
    extension, mime = validate_media(filename, content)
    bucket = _bucket()
    basename = "microphone" if filename.lower().startswith("microphone-") else "original"
    key = f"{owner_id}/{video_id}/{basename}{extension}"
    get_supabase_admin_client().storage.from_(bucket).upload(
        path=key, file=content,
        file_options={"content-type": mime, "upsert": "false"},
    )
    return f"storage://{bucket}/{key}"


def remove_media(uri: str, owner_id: str, video_id: str) -> None:
    bucket, key = _parse_storage_uri(uri, owner_id, video_id)
    get_supabase_admin_client().storage.from_(bucket).remove([key])


def signed_playback(video: dict) -> dict:
    """Issue a temporary, authenticated playback URL for an owned upload."""
    owner_id = str(video["owner_id"])
    video_id = str(video["video_id"])
    bucket, key = _parse_storage_uri(str(video["source_url"]), owner_id, video_id)
    response = get_supabase_admin_client().storage.from_(bucket).create_signed_url(
        key, 3600,
    )
    url = response.get("signedURL") or response.get("signed_url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise RuntimeError("Media playback URL unavailable.")
    extension = Path(key).suffix.lower()
    is_audio = Path(key).stem == "microphone" or extension not in {".mp4", ".webm"}
    return {
        "video_id": video_id, "url": url, "expires_in": 3600,
        "media_type": "audio" if is_audio else "video",
    }


def ingest_stored_media(video: dict, owner_id: str, video_id: str) -> dict:
    """Download private media, transcribe with Whisper, index timed SRT."""
    bucket, key = _parse_storage_uri(str(video["source_url"]), owner_id, video_id)
    content = get_supabase_admin_client().storage.from_(bucket).download(key)
    validate_media(key, content)

    with TemporaryDirectory() as temporary:
        path = Path(temporary) / f"media{Path(key).suffix.lower()}"
        path.write_bytes(content)
        transcript_text = transcribe_audio_to_srt(path)

    transcript_bytes = transcript_text.encode("utf-8")
    chunks_count = ingest_uploaded_transcript(
        filename="uploaded_media.srt", content=transcript_bytes,
        video_id=video_id, owner_id=owner_id,
    )
    get_supabase_admin_client().table("transcripts").upsert(
        {
            "video_id": video_id, "owner_id": owner_id,
            "content": transcript_text, "format": "srt", "source": "upload",
        }, on_conflict="video_id",
    ).execute()
    return {"video_id": video_id, "chunks_count": chunks_count}
