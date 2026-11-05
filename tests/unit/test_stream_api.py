import json

from fastapi.testclient import TestClient

import app.api.chat as chat_api
from app.main import app
from app.services.agents.stream_service import format_sse


client = TestClient(app)


def test_stream_success(monkeypatch):
    """Test SSE events without calling external APIs."""

    async def fake_stream_agent_response(
        question,
        video_id,
        owner_id,
        thread_id=None,
    ):
        yield format_sse("meta", {
            "video_id": video_id,
            "thread_id": thread_id or "test-thread-001",
        })

        yield format_sse("token", {
            "text": "AI helps coaches."
        })

        yield format_sse("sources", {
            "sources": []
        })

        yield format_sse("done", {
            "thread_id": thread_id or "test-thread-001",
            "answer": "AI helps coaches.",
            "model_used": "gpt-6.1-terra",
            "insufficient_evidence": False,
        })

    monkeypatch.setattr(
        chat_api,
        "stream_agent_response",
        fake_stream_agent_response,
    )

    response = client.post(
        "/api/v1/chat/stream",
        json={
            "video_id": "test-video-001",
            "message": "How can AI help coaches?",
            "thread_id": "existing-thread-123",
            "analysis_mode": "auto",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "text/event-stream"
    )

    events = []

    for block in response.text.strip().split("\n\n"):
        lines = block.splitlines()

        event_name = lines[0].removeprefix("event: ")
        event_data = json.loads(
            lines[1].removeprefix("data: ")
        )

        events.append((event_name, event_data))

    assert [name for name, _ in events] == [
        "meta", "token", "sources", "done"
    ]

    assert events[0][1]["thread_id"] == "existing-thread-123"
    assert events[1][1]["text"] == "AI helps coaches."
    assert events[3][1]["answer"] == "AI helps coaches."


def test_stream_empty_message():
    """Reject empty messages before starting the stream."""

    response = client.post(
        "/api/v1/chat/stream",
        json={
            "video_id": "test-video-001",
            "message": "",
        },
    )

    assert response.status_code == 422


def test_stream_deep_analysis_not_implemented():
    """Reject unsupported analysis modes."""

    response = client.post(
        "/api/v1/chat/stream",
        json={
            "video_id": "test-video-001",
            "message": "Analyze this video.",
            "analysis_mode": "deep",
        },
    )

    assert response.status_code == 501
