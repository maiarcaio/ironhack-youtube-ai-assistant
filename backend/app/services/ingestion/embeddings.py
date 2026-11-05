
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings


# Load environment variables
ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(ENV_PATH)


# Initialize embedding model
embedding_model = OpenAIEmbeddings(
    model="text-embedding-3-small"
)


def embed_chunks(chunks: list[str]) -> list[list[float]]:
    """
    Convert text chunks into numerical embeddings.
    """
    return embedding_model.embed_documents(chunks)
