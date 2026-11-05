import os
from pathlib import Path

from dotenv import load_dotenv
from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore


def get_vector_store(
    namespace: str = "videomind-dev",
) -> PineconeVectorStore:
    """Connect to the existing VideoMind AI Pinecone index."""

    env_path = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(env_path)

    if not os.getenv("PINECONE_API_KEY"):
        raise ValueError("Missing PINECONE_API_KEY.")

    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("Missing OPENAI_API_KEY.")

    index_name = os.getenv("PINECONE_INDEX_NAME")

    if index_name != "videomind-rag":
        raise ValueError("Invalid Pinecone index name.")

    from app.services.ingestion.embeddings import embedding_model

    client = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
    index = client.Index(index_name)

    return PineconeVectorStore(
        index=index,
        embedding=embedding_model,
        namespace=namespace,
    )
