"""Offline regression tests for YouTube, Deep Analysis, uploads, audio and moments.

All external systems are mocked. NO OpenAI, Pinecone or Supabase API calls.
"""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.auth import get_current_user_id
from app.services.agents.agent import get_model_name
from app.services.ingestion import storage_media, supadata_captions, youtube_captions

OWNER = str(uuid4())
VIDEO_ID = str(uuid4())
MP4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom"
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 16
SRT = "1\n00:00:03,000 --> 00:00:04,500\nFirst timed moment\n\n2\n00:01:03,000 --> 00:01:05,000\nSecond timed moment\n"


@pytest.fixture(autouse=True)
def clear_auth_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def auth():
    app.dependency_overrides[get_current_user_id] = lambda: OWNER


class Query:
    def __init__(self, data):
        self.data = data

    def select(self, *args, **kwargs): return self
    def eq(self, *args, **kwargs): return self
    def limit(self, *args, **kwargs): return self
    def upsert(self, *args, **kwargs): return self
    def execute(self): return SimpleNamespace(data=self.data)


class FakeDB:
    def __init__(self, data): self.data = data
    def table(self, _): return Query(self.data)


def test_model_mapping():
    assert get_model_name("auto") == "gpt-6.1-terra"
    assert get_model_name("deep") == "gpt-6.1-sol"
    with pytest.raises(ValueError):
        get_model_name("unknown")


@pytest.mark.parametrize("filename,data", [
    ("lecture.mp4", MP4), ("lecture.webm", WEBM),
])
def test_supported_uploads(filename, data):
    ext, mime = storage_media.validate_media(filename, data)
    assert ext in {".mp4", ".webm"}
    assert mime.startswith("video/")


def test_rejects_bad_media():
    with pytest.raises(ValueError):
        storage_media.validate_media("fake.mp4", b"not media")
    with pytest.raises(ValueError):
        storage_media.validate_media("payload.exe", MP4)


def test_private_media_references():
    uri = f"storage://videomind-videos/{OWNER}/{VIDEO_ID}/original.mp4"
    assert storage_media._parse_storage_uri(uri, OWNER, VIDEO_ID)[1].endswith(".mp4")
    with pytest.raises(ValueError):
        storage_media._parse_storage_uri(uri, str(uuid4()), VIDEO_ID)


def test_supadata_timestamps_are_milliseconds(monkeypatch):
    monkeypatch.setenv("SUPADATA_API_KEY", "fake-test-key")
    class Response:
        status_code = 200
        def raise_for_status(self): pass
        def json(self):
            return {"content": [{"text": "Hello", "offset": 3500, "duration": 1250}]}
    class HTTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, *args, **kwargs): return Response()
    monkeypatch.setattr(supadata_captions.httpx, "Client", HTTP)
    captions = supadata_captions.get_supadata_captions("dQw4w9WgXcQ")
    assert captions[0].start == 3.5
    assert captions[0].duration == 1.25


def test_native_youtube_ingestion_caches_srt(monkeypatch):
    cached = []
    class Captions:
        def fetch(self, *_args, **_kwargs):
            return [SimpleNamespace(text="Hello there", start=12.5, duration=2.5)]
    class CacheQuery:
        def upsert(self, data, **_):
            cached.append(data)
            return self
        def execute(self): return SimpleNamespace(data=[])
    class DB:
        def table(self, name):
            assert name == "transcripts"
            return CacheQuery()
    monkeypatch.setattr(youtube_captions, "ingest_transcript", lambda **kwargs: 2)
    monkeypatch.setattr(youtube_captions, "get_supabase_admin_client", lambda: DB())
    result = youtube_captions.ingest_youtube_captions(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        OWNER, transcript_api=Captions(), library_video_id=VIDEO_ID,
    )
    assert result["chunks_count"] == 2
    assert "00:00:12,500 --> 00:00:15,000" in cached[0]["content"]
    assert cached[0]["video_id"] == VIDEO_ID


def test_upload_requires_auth():
    with TestClient(app) as client:
        response = client.post("/api/v1/videos/upload", files={"file": ("clip.mp4", MP4, "video/mp4")})
    assert response.status_code == 401


def test_upload_bad_container_is_400():
    auth()
    with TestClient(app) as client:
        response = client.post("/api/v1/videos/upload", files={"file": ("clip.mp4", b"abc", "video/mp4")})
    assert response.status_code == 400


def test_upload_enqueues_without_transcribing(monkeypatch):
    from app.api import videos
    auth()
    seen = {}
    def fake_store(owner_id, video_id, filename, content):
        seen.update({"owner": owner_id, "video_id": video_id, "name": filename})
        return f"storage://videomind-videos/{owner_id}/{video_id}/original.mp4"
    def fake_enqueue(owner, uri, title, video_id):
        assert owner == OWNER and video_id == seen["video_id"]
        assert uri.startswith("storage://")
        return {"video_id": video_id, "status": "queued"}
    monkeypatch.setattr(videos, "store_media", fake_store)
    monkeypatch.setattr(videos, "enqueue_upload_video", fake_enqueue)
    with TestClient(app) as client:
        response = client.post("/api/v1/videos/upload", files={"file": ("lesson.mp4", MP4, "video/mp4")})
    assert response.status_code == 202
    assert response.json()["status"] == "queued"


def test_playback_other_users_video_is_404(monkeypatch):
    from app.api import videos
    auth()
    monkeypatch.setattr(videos, "get_video", lambda **kwargs: None)
    with TestClient(app) as client:
        response = client.get(f"/api/v1/videos/{VIDEO_ID}/playback")
    assert response.status_code == 404


def test_chat_deep_mode_passes_to_agent(monkeypatch):
    from app.api import chat
    auth()
    monkeypatch.setattr(chat, "get_video", lambda **kwargs: {"status": "completed"})
    seen = []
    def fake_answer(**kwargs):
        seen.append(kwargs)
        return {
            "thread_id": str(uuid4()), "answer": "Evidence-backed response",
            "sources": [], "insufficient_evidence": False,
            "model_used": "gpt-6.1-sol",
        }
    monkeypatch.setattr(chat, "answer_with_agent", fake_answer)
    with TestClient(app) as client:
        response = client.post("/api/v1/chat", json={
            "video_id": VIDEO_ID, "message": "Explain carefully", "analysis_mode": "deep",
        })
    assert response.status_code == 200
    assert response.json()["model_used"] == "gpt-6.1-sol"
    assert seen[0]["analysis_mode"] == "deep"


def test_stream_deep_mode_passes_to_generator(monkeypatch):
    from app.api import chat
    auth()
    monkeypatch.setattr(chat, "get_video", lambda **kwargs: {"status": "completed"})
    seen = []
    async def fake_stream(**kwargs):
        seen.append(kwargs)
        yield 'event: done\ndata: {"thread_id":"t","answer":"ok","model_used":"gpt-6.1-sol","insufficient_evidence":false}\n\n'
    monkeypatch.setattr(chat, "stream_agent_response", fake_stream)
    with TestClient(app) as client:
        response = client.post("/api/v1/chat/stream", json={
            "video_id": VIDEO_ID, "message": "Explain", "analysis_mode": "deep",
        })
    assert response.status_code == 200
    assert "event: done" in response.text
    assert seen[0]["analysis_mode"] == "deep"


def test_moments_preserve_real_times(monkeypatch):
    from app.services.ingestion import moments
    monkeypatch.setattr(moments, "get_supabase_admin_client",
                        lambda: FakeDB([{"format": "srt", "content": SRT}]))
    data = moments.get_video_moments(OWNER, VIDEO_ID)
    assert [m["start_seconds"] for m in data] == [3.0, 63.0]


def test_moments_endpoint_requires_owner(monkeypatch):
    from app.api import videos
    auth()
    monkeypatch.setattr(videos, "get_video", lambda **kwargs: None)
    with TestClient(app) as client:
        response = client.get(f"/api/v1/videos/{VIDEO_ID}/moments")
    assert response.status_code == 404


def test_uploaded_media_worker_processes_queue(monkeypatch):
    from app.services.ingestion import worker
    monkeypatch.setattr(worker, "claim_next_job", lambda: {
        "id": "job-01", "video_id": VIDEO_ID, "owner_id": OWNER,
    })
    monkeypatch.setattr(worker, "get_video", lambda **kwargs: {
        "source_type": "upload", "source_url": "storage://stub/path",
    })
    monkeypatch.setattr(worker, "update_video_status", lambda **kwargs: {"status": kwargs["new_status"]})
    monkeypatch.setattr(worker, "_finish_job", lambda **kwargs: None)
    monkeypatch.setattr(worker, "ingest_stored_media", lambda *args: {
        "video_id": VIDEO_ID, "chunks_count": 3,
    })
    result = worker.process_next_job()
    assert result == {"video_id": VIDEO_ID, "status": "completed", "chunks_count": 3}


def test_signed_playback_url(monkeypatch):
    class Storage:
        def from_(self, name): return self
        def create_signed_url(self, key, expires_in):
            assert expires_in == 3600
            return {"signedURL": "https://example.com/private?token=test"}
    monkeypatch.setattr(storage_media, "get_supabase_admin_client",
                        lambda: SimpleNamespace(storage=Storage()))
    video = {"video_id": VIDEO_ID, "owner_id": OWNER, "source_type": "upload",
             "source_url": f"storage://videomind-videos/{OWNER}/{VIDEO_ID}/original.mp4"}
    response = storage_media.signed_playback(video)
    assert response["media_type"] == "video"
    assert response["expires_in"] == 3600
