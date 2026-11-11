
"""Regression tests for evidence classification in REST and SSE.

All external services are mocked:
- No OpenAI API calls
- No Supabase requests
- No Pinecone requests
"""

import asyncio
import json
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.services.agents import chat_service, stream_service


VIDEO_ID = "test-video"
OWNER_ID = "test-user"
THREAD_ID = "test-thread"

SOURCE = {
    "chunk_id": "0000",
    "excerpt": "The recording tests audio transcription and cloud storage.",
    "start_seconds": 0.0,
    "end_seconds": 6.8,
    "source_type": "transcript",
}


@pytest.fixture
def mock_persistence(monkeypatch):
    """Replace database and model-name dependencies."""

    saved_turns = []

    for service in (chat_service, stream_service):
        monkeypatch.setattr(
            service,
            "get_or_create_thread",
            lambda **kwargs: THREAD_ID,
        )
        monkeypatch.setattr(
            service,
            "load_conversation_history",
            lambda **kwargs: [],
        )
        monkeypatch.setattr(
            service,
            "save_conversation_turn",
            lambda **kwargs: saved_turns.append(kwargs),
        )
        monkeypatch.setattr(
            service,
            "get_model_name",
            lambda mode: "test-model",
        )

    return saved_turns


def make_tool_message():
    return ToolMessage(
        name="search_video_transcript",
        content='{"results": []}',
        tool_call_id="test-tool-call",
    )


def setup_rest_agent(monkeypatch, answer, has_sources=True):
    """Mock the REST agent and evidence retrieval."""

    class FakeAgent:
        def invoke(self, payload):
            return {
                "messages": [
                    HumanMessage(content=payload["messages"][-1]["content"]),
                    make_tool_message(),
                    AIMessage(content=answer),
                ]
            }

    monkeypatch.setattr(
        chat_service,
        "create_video_agent",
        lambda **kwargs: FakeAgent(),
    )
    monkeypatch.setattr(
        chat_service,
        "extract_agent_answer",
        lambda result: result["messages"][-1].content,
    )
    monkeypatch.setattr(
        chat_service,
        "extract_tool_sources",
        lambda **kwargs: [SOURCE] if has_sources else [],
    )


def run_rest():
    return chat_service.answer_with_agent(
        question="What does the recording say?",
        video_id=VIDEO_ID,
        owner_id=OWNER_ID,
    )


def setup_stream_agent(monkeypatch, chunks, has_sources=True):
    """Mock streaming chunks and retrieved evidence."""

    class FakeAgent:
        async def astream(self, *args, **kwargs):
            yield {
                "type": "updates",
                "data": {
                    "tools": {
                        "messages": [make_tool_message()]
                    }
                },
            }

            for chunk in chunks:
                yield {
                    "type": "messages",
                    "data": (
                        SimpleNamespace(text=chunk),
                        {"langgraph_node": "model"},
                    ),
                }

    monkeypatch.setattr(
        stream_service,
        "create_video_agent",
        lambda **kwargs: FakeAgent(),
    )
    monkeypatch.setattr(
        stream_service,
        "extract_tool_sources",
        lambda **kwargs: [SOURCE] if has_sources else [],
    )


def run_stream():
    """Collect and decode all SSE events."""

    async def collect():
        events = []

        async for raw in stream_service.stream_agent_response(
            question="What does the recording say?",
            video_id=VIDEO_ID,
            owner_id=OWNER_ID,
        ):
            lines = raw.strip().splitlines()

            event_name = lines[0].removeprefix("event: ")
            payload = json.loads(
                lines[1].removeprefix("data: ")
            )

            events.append((event_name, payload))

        return events

    return asyncio.run(collect())


def get_event(events, name):
    return next(
        payload
        for event_name, payload in events
        if event_name == name
    )


# ============================================================
# REST TESTS
# ============================================================

@pytest.mark.parametrize(
    "status, expected_insufficient",
    [
        ("SUFFICIENT", False),
        ("INSUFFICIENT", True),
    ],
)
def test_rest_explicit_evidence_status(
    monkeypatch,
    mock_persistence,
    status,
    expected_insufficient,
):
    """REST must respect semantic status even when sources exist."""

    answer = "The requested price is not stated."

    setup_rest_agent(
        monkeypatch,
        f"EVIDENCE_STATUS:{status}\n{answer}",
        has_sources=True,
    )

    result = run_rest()

    assert result["answer"] == answer
    assert result["insufficient_evidence"] is expected_insufficient
    assert result["sources"] == [SOURCE]
    assert result["thread_id"] == THREAD_ID
    assert result["model_used"] == "test-model"

    assert mock_persistence[0]["answer"] == answer


@pytest.mark.parametrize(
    "has_sources, expected_insufficient",
    [
        (True, False),
        (False, True),
    ],
)
def test_rest_fallback_without_marker(
    monkeypatch,
    mock_persistence,
    has_sources,
    expected_insufficient,
):
    """REST must preserve the legacy fallback when status is absent."""

    answer = "This is a normal answer."

    setup_rest_agent(
        monkeypatch,
        answer,
        has_sources=has_sources,
    )

    result = run_rest()

    assert result["answer"] == answer
    assert result["insufficient_evidence"] is expected_insufficient
    assert mock_persistence[0]["answer"] == answer


def test_rest_insufficient_without_sources(
    monkeypatch,
    mock_persistence,
):
    """Explicit insufficient evidence must work without sources."""

    answer = "The recording does not provide that information."

    setup_rest_agent(
        monkeypatch,
        f"EVIDENCE_STATUS:INSUFFICIENT\n{answer}",
        has_sources=False,
    )

    result = run_rest()

    assert result["insufficient_evidence"] is True
    assert result["sources"] == []
    assert result["answer"] == answer


# ============================================================
# STREAMING SSE TESTS
# ============================================================

@pytest.mark.parametrize(
    "status, expected_insufficient",
    [
        ("SUFFICIENT", False),
        ("INSUFFICIENT", True),
    ],
)
def test_sse_status_split_across_chunks(
    monkeypatch,
    mock_persistence,
    status,
    expected_insufficient,
):
    """The evidence marker must never leak into streamed tokens."""

    answer = "The requested price is not stated."
    raw = f"EVIDENCE_STATUS:{status}\n{answer}"

    # Simulate a marker split into several model chunks.
    chunks = [
        raw[:4],
        raw[4:21],
        raw[21:26],
        raw[26:],
    ]

    setup_stream_agent(
        monkeypatch,
        chunks,
        has_sources=True,
    )

    events = run_stream()

    event_names = [name for name, _ in events]

    assert event_names[0] == "meta"
    assert event_names[-2:] == ["sources", "done"]
    assert "error" not in event_names

    tokens = "".join(
        data["text"]
        for name, data in events
        if name == "token"
    )

    assert tokens == answer
    assert "EVIDENCE_STATUS" not in tokens

    done = get_event(events, "done")
    sources = get_event(events, "sources")

    assert done["answer"] == answer
    assert done["insufficient_evidence"] is expected_insufficient
    assert done["model_used"] == "test-model"
    assert sources["sources"] == [SOURCE]

    assert mock_persistence[0]["answer"] == answer


@pytest.mark.parametrize(
    "has_sources, expected_insufficient",
    [
        (True, False),
        (False, True),
    ],
)
def test_sse_fallback_without_marker(
    monkeypatch,
    mock_persistence,
    has_sources,
    expected_insufficient,
):
    """SSE must handle older model responses without status markers."""

    answer = "The audio discusses cloud storage."

    setup_stream_agent(
        monkeypatch,
        ["The audio ", "discusses cloud storage."],
        has_sources=has_sources,
    )

    events = run_stream()

    tokens = "".join(
        data["text"]
        for name, data in events
        if name == "token"
    )

    done = get_event(events, "done")

    assert tokens == answer
    assert done["answer"] == answer
    assert done["insufficient_evidence"] is expected_insufficient
    assert mock_persistence[0]["answer"] == answer


def test_sse_error_handling(
    monkeypatch,
    mock_persistence,
):
    """A failed agent must emit an SSE error without saving an answer."""

    class FailingAgent:
        async def astream(self, *args, **kwargs):
            raise RuntimeError("Simulated agent failure")
            yield  # Keeps this method an async generator.

    monkeypatch.setattr(
        stream_service,
        "create_video_agent",
        lambda **kwargs: FailingAgent(),
    )

    events = run_stream()

    names = [name for name, _ in events]

    assert "meta" in names
    assert "error" in names
    assert "done" not in names
    assert mock_persistence == []
