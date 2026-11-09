from fastapi.testclient import TestClient

import app.api.chat as chat_api
from app.main import app


client = TestClient(app)


def test_chat_success(monkeypatch):
    """Test a successful agent response without calling OpenAI."""

    def fake_answer_with_agent(
        question,
        video_id,
        owner_id,
        thread_id=None,
    ):
        return {
            "video_id": video_id,
            "thread_id": thread_id or "test-thread-001",
            "answer": "AI helps analyze football tactics.",
            "sources": [
                {
                    "chunk_id": "test-chunk-001",
                    "excerpt": "AI helps coaches analyze tactics.",
                    "start_seconds": None,
                    "end_seconds": None,
                    "source_type": "transcript",
                }
            ],
            "insufficient_evidence": False,
            "model_used": "gpt-6.1-terra",
        }

    monkeypatch.setattr(
        chat_api,
        "answer_with_agent",
        fake_answer_with_agent,
    )

    response = client.post(
        "/api/v1/chat",
        json={
            "video_id": "test-video-001",
            "message": "How can AI help coaches?",
            "analysis_mode": "auto",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["video_id"] == "test-video-001"
    assert data["thread_id"] == "test-thread-001"
    assert data["answer"] == "AI helps analyze football tactics."
    assert data["model_used"] == "gpt-6.1-terra"
    assert len(data["sources"]) == 1
    assert data["sources"][0]["chunk_id"] == "test-chunk-001"
    assert data["insufficient_evidence"] is False


def test_chat_existing_thread(monkeypatch):
    """Verify that an existing conversation ID is preserved."""

    def fake_answer_with_agent(
        question,
        video_id,
        owner_id,
        thread_id=None,
    ):
        return {
            "video_id": video_id,
            "thread_id": thread_id or "test-thread-001",
            "answer": "This is a follow-up answer.",
            "sources": [],
            "insufficient_evidence": False,
            "model_used": "gpt-6.1-terra",
        }

    monkeypatch.setattr(
        chat_api,
        "answer_with_agent",
        fake_answer_with_agent,
    )

    response = client.post(
        "/api/v1/chat",
        json={
            "video_id": "test-video-001",
            "message": "Can you explain that further?",
            "thread_id": "existing-thread-123",
            "analysis_mode": "auto",
        },
    )

    assert response.status_code == 200
    assert response.json()["thread_id"] == "existing-thread-123"


def test_chat_empty_message():
    """Reject empty questions."""

    response = client.post(
        "/api/v1/chat",
        json={
            "video_id": "test-video-001",
            "message": "",
        },
    )

    assert response.status_code == 422


def test_deep_analysis_not_implemented():
    """Reject unsupported analysis modes."""

    response = client.post(
        "/api/v1/chat",
        json={
            "video_id": "test-video-001",
            "message": "Analyze this video.",
            "analysis_mode": "deep",
        },
    )

    assert response.status_code == 501
