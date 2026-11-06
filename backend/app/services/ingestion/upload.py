
from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.ingestion.pipeline import ingest_transcript


ALLOWED_EXTENSIONS = {".txt", ".srt", ".vtt"}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB


def ingest_uploaded_transcript(
    filename: str,
    content: bytes,
    video_id: str,
    owner_id: str,
) -> int:
    """
    Validate an uploaded transcript and ingest it into Pinecone.

    Supported formats: TXT, SRT and VTT.
    """

    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(
            "Unsupported file format. Use TXT, SRT or VTT."
        )

    if not content:
        raise ValueError("Uploaded file is empty.")

    if len(content) > MAX_FILE_SIZE:
        raise ValueError("Uploaded file exceeds the 2 MB limit.")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError(
            "Uploaded file must use UTF-8 encoding."
        ) from exc

    if not text.strip():
        raise ValueError("Transcript contains no text.")

    if not video_id.strip() or not owner_id.strip():
        raise ValueError(
            "Video ID and owner ID are required."
        )

    # Use a temporary file compatible with the existing pipeline.
    with TemporaryDirectory() as folder:
        file_path = Path(folder) / f"transcript{extension}"
        file_path.write_text(text, encoding="utf-8")

        chunks_count = ingest_transcript(
            file_path=str(file_path),
            video_id=video_id,
            owner_id=owner_id,
        )

    return chunks_count
