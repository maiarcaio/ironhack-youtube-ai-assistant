
import os
import sys
import re
from pathlib import Path
from getpass import getpass

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env", override=True)
os.environ["RUN_INGESTION_WORKER"] = "false"

from fastapi.testclient import TestClient
from supabase import create_client
from pinecone import Pinecone

from app.main import app
from app.services.persistence.supabase_client import get_supabase_admin_client
from app.services.retrieval.vector_store import get_vector_store

AUDIO = ROOT.parents[1] / "videomind-test-assets" / "speech_sample.mp3"
URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
ENDPOINT = "/api/v1/audio/transcribe"

assert AUDIO.is_file(), f"MP3 not found: {AUDIO}"
assert 0 < AUDIO.stat().st_size <= 24_000_000

email = input("Test user email: ")
password = getpass("Password: ")

auth = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_PUBLISHABLE_KEY"],
)
login = auth.auth.sign_in_with_password({
    "email": email,
    "password": password,
})
del password

assert login.session and login.user
owner = str(login.user.id)
headers = {"Authorization": f"Bearer {login.session.access_token}"}
admin = get_supabase_admin_client()
video_id = None

print("AUTH OK")

def upload(http, filename, content, headers=headers):
    return http.post(
        ENDPOINT,
        headers=headers,
        data={"video_id": video_id},
        files={"file": (filename, content, "audio/mpeg")},
    )

try:
    with TestClient(app) as http:
        r = http.post(
            "/api/v1/videos/ingest",
            json={"url": URL},
            headers=headers,
        )
        assert r.status_code == 202, r.text
        video_id = r.json()["video_id"]
        print("TEST VIDEO CREATED")

        job = admin.table("ingestion_jobs").update({
            "status": "failed",
            "last_error": "Test fallback",
        }).eq("video_id", video_id).eq(
            "owner_id", owner
        ).eq("status", "queued").execute()
        assert len(job.data) == 1

        video = admin.table("videos").update({
            "status": "failed",
            "error": "Test fallback",
        }).eq("video_id", video_id).eq(
            "owner_id", owner
        ).execute()
        assert len(video.data) == 1
        print("FAILED STATE OK")

        audio = AUDIO.read_bytes()
        r = upload(http, AUDIO.name, audio)
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "completed"
        assert r.json()["chunks_count"] > 0
        print("WHISPER + HTTP 201 OK")
        print("CHUNKS:", r.json()["chunks_count"])

        transcript = admin.table("transcripts").select(
            "format,source,content"
        ).eq("video_id", video_id).execute().data[0]

        assert transcript["format"] == "srt"
        assert transcript["source"] == "upload"
        assert re.search(
            r"\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}",
            transcript["content"],
        )
        print("SRT TIMESTAMPS OK")

        assert admin.table("videos").select("status").eq(
            "video_id", video_id
        ).execute().data[0]["status"] == "completed"

        assert admin.table("ingestion_jobs").select("status").eq(
            "video_id", video_id
        ).execute().data[0]["status"] == "completed"
        print("SUPABASE OK")

        docs = get_vector_store().similarity_search(
            "spoken content",
            k=2,
            filter={
                "video_id": {"$eq": video_id},
                "owner_id": {"$eq": owner},
            },
        )
        assert docs
        assert all(d.metadata["video_id"] == video_id for d in docs)
        assert any(d.metadata.get("start_seconds") is not None for d in docs)
        print("PINECONE + TIMESTAMPS OK")

        tests = [
            ("401", upload(http, AUDIO.name, audio, {}).status_code, 401),
            ("400 format", upload(http, "invalid.txt", b"x").status_code, 400),
            ("400 empty", upload(http, "empty.mp3", b"").status_code, 400),
            ("413", upload(http, "large.mp3", b"x" * 24_000_001).status_code, 413),
            ("409", upload(http, AUDIO.name, audio).status_code, 409),
        ]

        for name, actual, expected in tests:
            assert actual == expected, (name, actual)
            print(f"HTTP {name} OK")

        print("AUDIO E2E PASSED")

finally:
    if video_id:
        try:
            Pinecone(
                api_key=os.environ["PINECONE_API_KEY"]
            ).Index(
                os.environ["PINECONE_INDEX_NAME"]
            ).delete(
                filter={
                    "video_id": {"$eq": video_id},
                    "owner_id": {"$eq": owner},
                },
                namespace="videomind-dev",
            )
            print("PINECONE CLEANUP OK")
        except Exception as exc:
            print("PINECONE CLEANUP FAILED:", exc)

        deleted = admin.table("videos").delete().eq(
            "video_id", video_id
        ).eq("owner_id", owner).execute()
        assert deleted.data, "SUPABASE CLEANUP FAILED"
        print("SUPABASE CLEANUP OK")
