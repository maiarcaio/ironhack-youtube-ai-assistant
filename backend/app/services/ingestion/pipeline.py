from pathlib import Path

from langchain_core.documents import Document

from app.services.ingestion.loader import load_transcript
from app.services.ingestion.chunking import split_transcript
from app.services.retrieval.vector_store import get_vector_store


def ingest_transcript(
    file_path: str,
    video_id: str,
    owner_id: str,
) -> int:
    """
    Load a transcript, split it into chunks,
    and store embeddings in Pinecone.
    """

    # Step 1: Load transcript
    text = load_transcript(file_path)

    # Step 2: Split into chunks
    chunks = split_transcript(text)

    if not chunks:
        raise ValueError("No transcript chunks generated.")

    # Step 3: Create documents with metadata
    documents = []
    ids = []

    for index, chunk in enumerate(chunks):
        chunk_id = f"{owner_id}:{video_id}:{index:04d}"

        documents.append(
            Document(
                page_content=chunk,
                metadata={
                    "video_id": video_id,
                    "owner_id": owner_id,
                    "chunk_id": chunk_id,
                    "source_type": "transcript",
                },
            )
        )

        ids.append(chunk_id)

    # Step 4: Store vectors in Pinecone
    store = get_vector_store()

    store.add_documents(
        documents=documents,
        ids=ids,
    )

    return len(documents)
