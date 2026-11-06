
from pathlib import Path

from langchain_core.documents import Document

from app.services.ingestion.loader import load_transcript
from app.services.ingestion.chunking import (
    split_transcript,
    split_timed_transcript,
)
from app.services.ingestion.transcript_parser import (
    load_timed_transcript,
)
from app.services.retrieval.vector_store import get_vector_store


def ingest_transcript(
    file_path: str,
    video_id: str,
    owner_id: str,
) -> int:
    """
    Ingest TXT, SRT or VTT transcripts into Pinecone.

    Preserve source timestamps when available.
    """

    extension = Path(file_path).suffix.lower()

    if extension in {".srt", ".vtt"}:
        segments = load_timed_transcript(file_path)
        documents = split_timed_transcript(segments)

    else:
        text = load_transcript(file_path)
        chunks = split_transcript(text)

        documents = [
            Document(page_content=chunk)
            for chunk in chunks
        ]

    if not documents:
        raise ValueError("No transcript chunks generated.")


    ids = []

    for index, document in enumerate(documents):
        chunk_id = f"{owner_id}:{video_id}:{index:04d}"

        document.metadata.update({
            "video_id": video_id,
            "owner_id": owner_id,
            "chunk_id": chunk_id,
            "source_type": "transcript",
        })

        ids.append(chunk_id)


    store = get_vector_store()

    store.add_documents(
        documents=documents,
        ids=ids,
    )

    return len(documents)
