
import hashlib
import json
from uuid import uuid4

from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver

from app.services.agents.agent import (
    MODEL_NAME,
    create_video_agent,
    extract_agent_answer,
)


# Shared memory for local development.
# Production will use persistent PostgreSQL checkpoints.
_checkpointer = InMemorySaver()


def answer_with_agent(
    question: str,
    video_id: str,
    owner_id: str,
    thread_id: str | None = None,
) -> dict:
    """
    Run the video agent and return an API-compatible response.
    """

    if not question.strip() or len(question) > 500:
        raise ValueError("Question must contain 1-500 characters.")

    if not video_id.strip() or not owner_id.strip():
        raise ValueError("Video ID and owner ID are required.")

    public_thread_id = thread_id or str(uuid4())

    # Scope memory to the user, video, and conversation.
    scope = json.dumps(
        [owner_id, video_id, public_thread_id],
        ensure_ascii=False,
    )
    internal_thread_id = hashlib.sha256(
        scope.encode("utf-8")
    ).hexdigest()

    agent = create_video_agent(
        video_id=video_id,
        owner_id=owner_id,
        checkpointer=_checkpointer,
    )

    result = agent.invoke(
        {"messages": [{"role": "user", "content": question}]},
        config={
            "configurable": {
                "thread_id": internal_thread_id
            }
        },
    )

    messages = result["messages"]
    answer = extract_agent_answer(result)

    # Only inspect tools executed during the latest turn.
    last_user_index = max(
        index
        for index, message in enumerate(messages)
        if isinstance(message, HumanMessage)
    )

    sources = []
    seen_chunks = set()
    search_executed = False

    for message in messages[last_user_index + 1:]:
        if not isinstance(message, ToolMessage):
            continue

        if message.name not in (None, "search_video_transcript"):
            continue

        if not isinstance(message.content, str):
            continue

        try:
            payload = json.loads(message.content)
        except json.JSONDecodeError:
            continue

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

    return {
        "video_id": video_id,
        "thread_id": public_thread_id,
        "answer": answer,
        "sources": sources,
        "insufficient_evidence": search_executed and not sources,
        "model_used": MODEL_NAME,
    }
