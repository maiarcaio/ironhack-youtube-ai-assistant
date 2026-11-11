
"""Stream agent responses with persistent Supabase memory."""

import asyncio
import json
import logging

from langchain_core.messages import ToolMessage

from app.services.agents.agent import (
    MODEL_NAME,
    get_model_name,
    create_video_agent,
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


logger = logging.getLogger(__name__)


def format_sse(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


async def stream_agent_response(
    question: str,
    video_id: str,
    owner_id: str,
    thread_id: str | None = None,
    analysis_mode: str = "auto",
):
    """Stream agent responses and persist conversation history."""

    if not question.strip() or len(question) > 500:
        raise ValueError("Question must contain 1-500 characters.")

    if not video_id.strip() or not owner_id.strip():
        raise ValueError("Video ID and owner ID are required.")

    try:
        public_thread_id = await asyncio.to_thread(
            get_or_create_thread,
            owner_id=owner_id,
            video_id=video_id,
            thread_id=thread_id,
        )

        history = await asyncio.to_thread(
            load_conversation_history,
            owner_id=owner_id,
            thread_id=public_thread_id,
        )

        agent = create_video_agent(
            video_id=video_id,
            owner_id=owner_id,
            checkpointer=None,
            analysis_mode=analysis_mode,
        )

        messages = [
            *history,
            {"role": "user", "content": question},
        ]

        yield format_sse("meta", {
            "video_id": video_id,
            "thread_id": public_thread_id,
        })

        answer_parts = []
        sources = []
        seen_chunks = set()
        search_executed = False

        # Buffer only the beginning of the answer to remove
        # the evidence status marker without breaking SSE.
        status_options = {
            "EVIDENCE_STATUS:SUFFICIENT": False,
            "EVIDENCE_STATUS:INSUFFICIENT": True,
        }

        prefix_buffer = ""
        status_pending = True
        explicit_insufficient = None

        async for part in agent.astream(
            {"messages": messages},
            stream_mode=["messages", "updates"],
            version="v2",
        ):
            if part["type"] == "messages":
                chunk, metadata = part["data"]

                if metadata.get("langgraph_node") != "model":
                    continue

                text = chunk.text

                if not text:
                    continue

                if status_pending:
                    prefix_buffer += text

                    first_line, separator, remaining = (
                        prefix_buffer.partition("\n")
                    )

                    if separator:
                        status = first_line.strip()

                        if status in status_options:
                            explicit_insufficient = status_options[status]
                            status_pending = False
                            prefix_buffer = ""

                            if remaining:
                                answer_parts.append(remaining)
                                yield format_sse(
                                    "token", {"text": remaining}
                                )
                        else:
                            status_pending = False
                            answer_parts.append(prefix_buffer)
                            yield format_sse(
                                "token", {"text": prefix_buffer}
                            )
                            prefix_buffer = ""

                    else:
                        candidate = prefix_buffer.strip()

                        possible_header = any(
                            option.startswith(candidate)
                            for option in status_options
                        )

                        if not possible_header:
                            status_pending = False
                            answer_parts.append(prefix_buffer)
                            yield format_sse(
                                "token", {"text": prefix_buffer}
                            )
                            prefix_buffer = ""

                else:
                    answer_parts.append(text)
                    yield format_sse("token", {"text": text})

            elif part["type"] == "updates":
                tool_update = part["data"].get("tools", {})

                for message in tool_update.get("messages", []):
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

        # Flush any buffered text if the model omitted the marker.
        if status_pending and prefix_buffer:
            answer_parts.append(prefix_buffer)
            yield format_sse("token", {"text": prefix_buffer})

        answer = "".join(answer_parts).strip()

        if not answer:
            raise RuntimeError("Agent returned no answer.")

        # Use the explicit semantic assessment when available.
        if explicit_insufficient is not None:
            insufficient_evidence = explicit_insufficient
        else:
            answer, insufficient_evidence = parse_evidence_status(
                answer,
                fallback=search_executed and not sources,
            )

        await asyncio.to_thread(
            save_conversation_turn,
            owner_id=owner_id,
            video_id=video_id,
            thread_id=public_thread_id,
            question=question,
            answer=answer,
            sources=sources,
        )

        yield format_sse("sources", {
            "sources": sources,
        })

        yield format_sse("done", {
            "thread_id": public_thread_id,
            "answer": answer,
            "model_used": get_model_name(analysis_mode),
            "insufficient_evidence": insufficient_evidence,
        })

    except Exception:
        logger.exception(
            "VideoMind stream failed for video %s",
            video_id,
        )

        yield format_sse("error", {
            "message": "Unable to complete or save the response."
        })
