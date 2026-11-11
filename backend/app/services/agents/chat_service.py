
"""LangChain agent chat with persistent Supabase memory."""

from uuid import uuid4

from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver

from app.services.agents.agent import (
    MODEL_NAME,
    get_model_name,
    create_video_agent,
    extract_agent_answer,
)
from app.services.agents.evidence import (
    EVIDENCE_TOOLS,
    extract_tool_sources,
    parse_evidence_status,
)
from app.services.persistence.chat_repository import (
    get_or_create_thread,
    load_conversation_history,
    save_conversation_turn,
)


# Temporarily retained for the streaming service.
_checkpointer = InMemorySaver()


def answer_with_agent(
    question: str,
    video_id: str,
    owner_id: str,
    thread_id: str | None = None,
    analysis_mode: str = "auto",
) -> dict:
    """Answer a question using persistent conversation history."""

    if not question.strip() or len(question) > 500:
        raise ValueError("Question must contain 1-500 characters.")

    if not video_id.strip() or not owner_id.strip():
        raise ValueError("Video ID and owner ID are required.")

    # Create or validate the persistent conversation.
    public_thread_id = get_or_create_thread(
        owner_id=owner_id,
        video_id=video_id,
        thread_id=thread_id,
    )

    # Load previous messages from Supabase.
    history = load_conversation_history(
        owner_id=owner_id,
        thread_id=public_thread_id,
    )

    messages = [
        *history,
        {"role": "user", "content": question},
    ]

    # Supabase manages memory, not the in-memory checkpointer.
    agent = create_video_agent(
        video_id=video_id,
        owner_id=owner_id,
        checkpointer=None,
        analysis_mode=analysis_mode,
    )

    result = agent.invoke({"messages": messages})

    response_messages = result["messages"]
    answer = extract_agent_answer(result)

    last_user_index = max(
        index
        for index, message in enumerate(response_messages)
        if isinstance(message, HumanMessage)
    )

    sources = []
    seen_chunks = set()
    search_executed = False

    for message in response_messages[last_user_index + 1:]:
        if not isinstance(message, ToolMessage):
            continue

        if message.name not in EVIDENCE_TOOLS:
            continue

        if not isinstance(message.content, str):
            continue

        search_executed = True

        evidence = extract_tool_sources(
            tool_name=message.name,
            content=message.content,
            video_id=video_id,
        )

        for source in evidence:
            chunk_id = source["chunk_id"]

            if chunk_id in seen_chunks:
                continue

            seen_chunks.add(chunk_id)
            sources.append(source)

    # Extract semantic evidence assessment.
    # Keep the status marker out of the user-facing answer.
    answer, insufficient_evidence = parse_evidence_status(
        answer,
        fallback=search_executed and not sources,
    )

    # Save the clean exchange in Supabase.
    save_conversation_turn(
        owner_id=owner_id,
        video_id=video_id,
        thread_id=public_thread_id,
        question=question,
        answer=answer,
        sources=sources,
    )

    return {
        "video_id": video_id,
        "thread_id": public_thread_id,
        "answer": answer,
        "sources": sources,
        "insufficient_evidence": insufficient_evidence,
        "model_used": get_model_name(analysis_mode),
    }
