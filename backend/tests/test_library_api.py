"""Library management API regression tests (mocked, no external calls)."""

import pytest
from fastapi.testclient import TestClient

from app.api.auth import get_current_user_id
from app.api import videos as video_api
from app.main import app


OWNER_ID = "00000000-0000-4000-8000-000000000001"
VIDEO_ID = "00000000-0000-4000-8000-000000000002"


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user_id] = lambda: OWNER_ID
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_current_user_id, None)


def test_list_active_and_archived(client, monkeypatch):
    seen = []

    def fake_list(owner_id, archived=False):
        seen.append((owner_id, archived))
        return [{
            "video_id": VIDEO_ID, "title": "Real title",
            "status": "completed", "source_url": None, "archived_at": None,
        }]

    monkeypatch.setattr(video_api, "fetch_user_videos", fake_list)
    assert client.get("/api/v1/videos").status_code == 200
    assert client.get("/api/v1/videos?archived=true").status_code == 200
    assert seen == [(OWNER_ID, False), (OWNER_ID, True)]


@pytest.mark.parametrize("action,flag", [
    ("archive", True),
    ("restore", False),
])
def test_archive_restore_owner_scoped(client, monkeypatch, action, flag):
    seen = []

    def fake_set(owner_id, video_id, archived):
        seen.append((owner_id, video_id, archived))
        return {"video_id": video_id}

    monkeypatch.setattr(video_api, "set_video_archived", fake_set)
    result = client.post(f"/api/v1/videos/{VIDEO_ID}/{action}")
    assert result.status_code == 200
    assert result.json()["archived"] is flag
    assert seen == [(OWNER_ID, VIDEO_ID, flag)]


def test_archive_not_found(client, monkeypatch):
    monkeypatch.setattr(video_api, "set_video_archived", lambda **kwargs: None)
    assert client.post(f"/api/v1/videos/{VIDEO_ID}/archive").status_code == 404


@pytest.mark.parametrize("repository_result,status_code", [
    (None, 404),
    (False, 409),
    (True, 204),
])
def test_delete_statuses(client, monkeypatch, repository_result, status_code):
    seen = []

    def fake_delete(owner_id, video_id):
        seen.append((owner_id, video_id))
        return repository_result

    monkeypatch.setattr(video_api, "soft_delete_video", fake_delete)
    response = client.delete(f"/api/v1/videos/{VIDEO_ID}")
    assert response.status_code == status_code
    assert seen == [(OWNER_ID, VIDEO_ID)]


def test_unauthed_library_mutation_rejected(monkeypatch):
    app.dependency_overrides.pop(get_current_user_id, None)
    with TestClient(app) as unauthenticated:
        assert unauthenticated.post(f"/api/v1/videos/{VIDEO_ID}/archive").status_code == 401
        assert unauthenticated.delete(f"/api/v1/videos/{VIDEO_ID}").status_code == 401
