
import hashlib
import json
from uuid import uuid4

from langchain_core.messages import ToolMessage

from app.services.agents.agent import MODEL_NAME, create_video_agent
from app.services.agents.chat_service import _checkpointer


def format_sse(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


async def stream_agent_response(
    question: str,
    video_id: str,
    owner_id: str,
    thread_id: str | None = None,
):
    """
    Stream agent responses as SSE events.

    Events:
        meta    - Conversation identifiers
        token   - Generated answer text
        sources - Retrieved video evidence
        done    - Completion metadata
        error   - Streaming failure
    """

    if not question.strip() or len(question) > 500:
        raise ValueError("Question must contain 1-500 characters.")

    if not video_id.strip() or not owner_id.strip():
        raise ValueError("Video ID and owner ID are required.")

    public_thread_id = thread_id or str(uuid4())

    scope = json.dumps(
        [owner_id, video_id, public_thread_id],
        ensure_ascii=False,
    )

    internal_thread_id = hashlib.sha256(
        scope.encode("utf-8")
    ).hexdigest()

    config = {
        "configurable": {
            "thread_id": internal_thread_id
        }
    }

    agent = create_video_agent(
        video_id=video_id,
        owner_id=owner_id,
        checkpointer=_checkpointer,
    )

    yield format_sse("meta", {
        "video_id": video_id,
        "thread_id": public_thread_id,
    })

    answer_parts = []
    sources = []
    seen_chunks = set()
    search_executed = False

    try:
        async for part in agent.astream(
            {
                "messages": [
                    {"role": "user", "content": question}
                ]
            },
            config=config,
            stream_mode=["messages", "updates"],
            version="v2",
        ):
            if part["type"] == "messages":
                chunk, metadata = part["data"]

                if metadata.get("langgraph_node") != "model":
                    continue

                text = chunk.text

                if text:
                    answer_parts.append(text)
                    yield format_sse("token", {"text": text})

            elif part["type"] == "updates":
                tool_update = part["data"].get("tools", {})

                for message in tool_update.get("messages", []):
                    if not isinstance(message, ToolMessage):
                        continue

                    if message.name != "search_video_transcript":
                        continue

                    if not isinstance(message.content, str):
                        continue

                    payload = json.loads(message.content)

                    if payload.get("video_id") != video_id:
                        continue

                    search_executed = True

                    for item in payload.get("results", []):
                        chunk_id = item.get("chunk_id")

                        if not chunk_id or chunk_id in seen_chunks:
                            continue

                        seen_chunks.add(chunk_id)

                        sources.append({
                            "chunk_id": chunk_id,
                            "excerpt": item.get("content", ""),
                            "start_seconds": item.get("start_seconds"),
                            "end_seconds": item.get("end_seconds"),
                            "source_type": "transcript",
                        })

        yield format_sse("sources", {"sources": sources})

        yield format_sse("done", {
            "thread_id": public_thread_id,
            "answer": "".join(answer_parts),
            "model_used": MODEL_NAME,
            "insufficient_evidence": (
                search_executed and not sources
            ),
        })

    except Exception:
        yield format_sse("error", {
            "message": "Unable to complete the streamed response."
        })
