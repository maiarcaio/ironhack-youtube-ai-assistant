from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.ingestion.transcript_parser import TranscriptSegment


def split_transcript(text: str) -> list[str]:
    """Split plain-text transcripts into chunks."""

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=250,
        chunk_overlap=40,
        length_function=len,
    )

    return splitter.split_text(text)


def split_timed_transcript(
    segments: list[TranscriptSegment],
    chunk_size: int = 250,
    max_gap_seconds: float = 3.0,
) -> list[Document]:
    """
    Group subtitle segments while preserving their real
    start and end timestamps.

    Never estimate timestamps for individual words.
    """

    documents = []
    current_segments = []

    def save_chunk():
        if not current_segments:
            return

        documents.append(
            Document(
                page_content=" ".join(
                    segment.text.strip()
                    for segment in current_segments
                ),
                metadata={
                    "start_seconds": min(
                        segment.start_seconds
                        for segment in current_segments
                    ),
                    "end_seconds": max(
                        segment.end_seconds
                        for segment in current_segments
                    ),
                },
            )
        )

    for segment in sorted(
        segments,
        key=lambda item: item.start_seconds,
    ):
        if not segment.text.strip():
            continue

        current_text = " ".join(
            item.text.strip()
            for item in current_segments
        )

        current_end = max(
            (item.end_seconds for item in current_segments),
            default=segment.start_seconds,
        )

        exceeds_size = (
            bool(current_segments)
            and len(current_text) + len(segment.text) + 1 > chunk_size
        )

        exceeds_gap = (
            bool(current_segments)
            and segment.start_seconds - current_end > max_gap_seconds
        )

        if exceeds_size or exceeds_gap:
            save_chunk()
            current_segments = []

        current_segments.append(segment)

    save_chunk()

    return documents
