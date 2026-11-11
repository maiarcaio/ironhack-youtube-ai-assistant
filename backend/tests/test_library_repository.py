"""Persistence regressions for soft-deleted and archived videos."""

from types import SimpleNamespace

from app.services.persistence import video_repository as repo


OWNER_ID = "00000000-0000-4000-8000-000000000001"
VIDEO_ID = "00000000-0000-4000-8000-000000000002"


class Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.update_payload = None

    def select(self, fields):
        self.fields = fields
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def is_(self, column, value):
        self.filters.append(("is", column, value))
        return self

    def limit(self, count):
        return self

    def order(self, *args, **kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class Client:
    def __init__(self, rows):
        self.query = Query(rows)

    def table(self, table):
        assert table == "videos"
        return self.query


def test_deleted_video_inaccessible(monkeypatch):
    client = Client([])
    monkeypatch.setattr(repo, "get_supabase_admin_client", lambda: client)
    assert repo.get_video(OWNER_ID, VIDEO_ID) is None
    assert ("eq", "owner_id", OWNER_ID) in client.query.filters
    assert ("eq", "video_id", VIDEO_ID) in client.query.filters
    assert ("is", "deleted_at", "null") in client.query.filters


def test_library_filters_archived_and_deleted(monkeypatch):
    client = Client([
        {"video_id": "active", "archived_at": None},
        {"video_id": "archived", "archived_at": "2026-11-11T10:00:00Z"},
    ])
    monkeypatch.setattr(repo, "get_supabase_admin_client", lambda: client)
    assert [x["video_id"] for x in repo.list_videos(OWNER_ID)] == ["active"]
    assert [x["video_id"] for x in repo.list_videos(OWNER_ID, archived=True)] == ["archived"]
    assert ("is", "deleted_at", "null") in client.query.filters


def test_soft_delete_rejects_active_processing(monkeypatch):
    for status in ("queued", "processing"):
        monkeypatch.setattr(repo, "get_video", lambda **kwargs: {"status": status})
        monkeypatch.setattr(
            repo, "get_supabase_admin_client",
            lambda: (_ for _ in ()).throw(AssertionError("must not update")),
        )
        assert repo.soft_delete_video(OWNER_ID, VIDEO_ID) is False


def test_soft_delete_persists_tombstone_with_owner_and_status(monkeypatch):
    monkeypatch.setattr(repo, "get_video", lambda **kwargs: {"status": "completed"})
    client = Client([{"video_id": VIDEO_ID}])
    monkeypatch.setattr(repo, "get_supabase_admin_client", lambda: client)

    assert repo.soft_delete_video(OWNER_ID, VIDEO_ID) is True
    assert client.query.update_payload["deleted_at"] is not None
    assert client.query.update_payload["archived_at"] is None
    assert ("eq", "owner_id", OWNER_ID) in client.query.filters
    assert ("eq", "video_id", VIDEO_ID) in client.query.filters
    assert ("eq", "status", "completed") in client.query.filters
    assert ("is", "deleted_at", "null") in client.query.filters


def test_archive_owner_scoped_and_preserves_media(monkeypatch):
    monkeypatch.setattr(repo, "get_video", lambda **kwargs: {"status": "completed"})
    client = Client([{"video_id": VIDEO_ID}])
    monkeypatch.setattr(repo, "get_supabase_admin_client", lambda: client)

    result = repo.set_video_archived(OWNER_ID, VIDEO_ID, archived=True)
    assert result == {"video_id": VIDEO_ID}
    assert set(client.query.update_payload) == {"archived_at"}
    assert ("eq", "owner_id", OWNER_ID) in client.query.filters
    assert ("is", "deleted_at", "null") in client.query.filters

    repo.set_video_archived(OWNER_ID, VIDEO_ID, archived=False)
    assert client.query.update_payload["archived_at"] is None
