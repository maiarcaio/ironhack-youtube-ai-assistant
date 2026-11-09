from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.api.auth import get_current_user_id
from app.api import videos


USER_A = str(uuid4())
USER_B = str(uuid4())
VIDEO_A = str(uuid4())


def test_library_requires_authentication():
    with TestClient(app) as client:
        response = client.get("/api/v1/videos")
    assert response.status_code == 401


def test_library_rejects_invalid_token(monkeypatch):
    from supabase_auth.errors import AuthError
    from app.api import auth

    def reject_token():
        raise AuthError("Invalid token", "invalid_token")

    monkeypatch.setattr(
        auth,
        "get_supabase_admin_client",
        reject_token,
    )

    with TestClient(app) as client:
        response = client.get(
            "/api/v1/videos",
            headers={"Authorization": "Bearer invalid-test-token"},
        )

    assert response.status_code == 401


def test_user_cannot_access_another_users_video(monkeypatch):
    def fake_get_video(owner_id, video_id):
        if owner_id == USER_A and video_id == VIDEO_A:
            return {
                "video_id": VIDEO_A,
                "status": "completed",
                "error": None,
            }
        return None

    monkeypatch.setattr(videos, "get_video", fake_get_video)

    app.dependency_overrides[get_current_user_id] = lambda: USER_B

    try:
        with TestClient(app) as client:
            response = client.get(
                f"/api/v1/videos/{VIDEO_A}/status"
            )

        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()

def test_chat_requires_authentication():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/chat",
            json={"video_id": VIDEO_A, "message": "Teste"},
        )
    assert response.status_code == 401


def test_stream_requires_authentication():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/chat/stream",
            json={"video_id": VIDEO_A, "message": "Teste"},
        )
    assert response.status_code == 401


def test_chat_rejects_another_users_video(monkeypatch):
    from app.api import chat

    def fake_get_video(owner_id, video_id):
        return (
            {"video_id": VIDEO_A, "status": "completed"}
            if owner_id == USER_A and video_id == VIDEO_A
            else None
        )

    def forbidden_agent(**kwargs):
        raise AssertionError("Agent must not execute")

    monkeypatch.setattr(chat, "get_video", fake_get_video)
    monkeypatch.setattr(chat, "answer_with_agent", forbidden_agent)

    app.dependency_overrides[get_current_user_id] = lambda: USER_B
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/chat",
                json={"video_id": VIDEO_A, "message": "Teste"},
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_stream_rejects_another_users_video(monkeypatch):
    from app.api import chat

    def fake_get_video(owner_id, video_id):
        return (
            {"video_id": VIDEO_A, "status": "completed"}
            if owner_id == USER_A and video_id == VIDEO_A
            else None
        )

    def forbidden_stream(**kwargs):
        raise AssertionError("Stream must not execute")

    monkeypatch.setattr(chat, "get_video", fake_get_video)
    monkeypatch.setattr(chat, "stream_agent_response", forbidden_stream)

    app.dependency_overrides[get_current_user_id] = lambda: USER_B
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/chat/stream",
                json={"video_id": VIDEO_A, "message": "Teste"},
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_thread_rejects_other_user(monkeypatch):
    from types import SimpleNamespace
    from fastapi import HTTPException
    from app.services.persistence import chat_repository

    class FakeQuery:
        def __init__(self):
            self.filters = {}

        def select(self, *_):
            return self

        def eq(self, field, value):
            self.filters[field] = value
            return self

        def limit(self, *_):
            return self

        def execute(self):
            matching = (
                self.filters.get("owner_id") == USER_A
                and self.filters.get("video_id") == VIDEO_A
            )
            return SimpleNamespace(
                data=[{"id": "thread-a"}] if matching else []
            )

    class FakeClient:
        def table(self, name):
            assert name == "chat_threads"
            return FakeQuery()

    monkeypatch.setattr(
        chat_repository,
        "get_supabase_admin_client",
        lambda: FakeClient(),
    )

    try:
        chat_repository.get_or_create_thread(
            owner_id=USER_B,
            video_id=VIDEO_A,
            thread_id="thread-a",
        )
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("Cross-user thread access was allowed")


def test_history_filters_by_owner_and_thread(monkeypatch):
    from types import SimpleNamespace
    from app.services.persistence import chat_repository

    class FakeQuery:
        def __init__(self):
            self.filters = {}

        def select(self, *_):
            return self

        def eq(self, field, value):
            self.filters[field] = value
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, *_):
            return self

        def execute(self):
            assert self.filters["owner_id"] == USER_B
            assert self.filters["thread_id"] == "thread-b"
            return SimpleNamespace(data=[])

    class FakeClient:
        def table(self, name):
            assert name == "chat_messages"
            return FakeQuery()

    monkeypatch.setattr(
        chat_repository,
        "get_supabase_admin_client",
        lambda: FakeClient(),
    )

    result = chat_repository.load_conversation_history(
        owner_id=USER_B,
        thread_id="thread-b",
    )
    assert result == []
