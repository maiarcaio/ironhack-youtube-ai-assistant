import json

from langchain_core.tools import BaseTool, tool

from app.services.retrieval.vector_store import get_vector_store


def create_video_search_tool(
    video_id: str,
    owner_id: str,
) -> BaseTool:
    """
    Create a search tool restricted to a selected video and owner.
    """

    if not video_id.strip() or not owner_id.strip():
        raise ValueError("Video ID and owner ID are required.")

    @tool
    def search_video_transcript(query: str) -> str:
        """
        Search the selected video's transcript for evidence
        relevant to a question. Returns excerpts and source IDs.
        """
        if not query.strip():
            return "Search query cannot be empty."

        store = get_vector_store()

        documents = store.similarity_search(
            query=query[:500],
            k=3,
            filter={
                "video_id": {"$eq": video_id},
                "owner_id": {"$eq": owner_id},
            },
        )

        results = []

        for document in documents:
            results.append({
                "chunk_id": document.metadata.get("chunk_id"),
                "content": document.page_content[:1000],
                "start_seconds": document.metadata.get("start_seconds"),
                "end_seconds": document.metadata.get("end_seconds"),
            })

        return json.dumps(
            {
                "video_id": video_id,
                "results": results,
            },
            ensure_ascii=False,
        )

    return search_video_transcript
