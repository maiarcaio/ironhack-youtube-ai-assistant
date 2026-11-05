
from fastapi.testclient import TestClient

import app.api.chat as chat_api
from app.main import app


client = TestClient(app)


def test_chat_success(monkeypatch):
    """Test a successful RAG response without calling OpenAI."""

    def fake_answer_from_video(question, video_id, owner_id):
        return {
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
        "answer_from_video",
        fake_answer_from_video,
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
    assert data["thread_id"]
    assert data["model_used"] == "gpt-6.1-terra"
    assert len(data["sources"]) == 1


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
