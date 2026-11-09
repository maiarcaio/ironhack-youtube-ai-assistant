
"""End-to-end authentication and persistence smoke test."""

import os
import sys
from getpass import getpass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from supabase import create_client

from app.main import app
from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)

load_dotenv(BACKEND_DIR / ".env", override=True)

TEST_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

email = input("Test user email: ").strip()
password = getpass("Test user password: ")

auth_client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_PUBLISHABLE_KEY"],
)

login = auth_client.auth.sign_in_with_password(
    {
        "email": email,
        "password": password,
    }
)

del password

if login.session is None or login.user is None:
    raise RuntimeError("Authentication failed.")

owner_id = str(login.user.id)

headers = {
    "Authorization": f"Bearer {login.session.access_token}"
}

print("AUTH OK")

video_id = None

try:
    with TestClient(app) as http:
        # Create the video and queue its ingestion job.
        ingest = http.post(
            "/api/v1/videos/ingest",
            json={"url": TEST_URL},
            headers=headers,
        )

        if ingest.status_code != 202:
            raise RuntimeError(
                f"INGEST FAILED: {ingest.status_code} "
                f"{ingest.text}"
            )

        video_id = ingest.json()["video_id"]
        print("INGEST OK: 202")

        # Confirm the stored processing status.
        status_response = http.get(
            f"/api/v1/videos/{video_id}/status",
            headers=headers,
        )

        if status_response.status_code != 200:
            raise RuntimeError(
                f"STATUS FAILED: {status_response.text}"
            )

        assert status_response.json()["status"] == "queued"
        print("STATUS OK: queued")

        # Confirm the video belongs to this user's library.
        library = http.get(
            "/api/v1/videos",
            headers=headers,
        )

        if library.status_code != 200:
            raise RuntimeError(
                f"LIBRARY FAILED: {library.text}"
            )

        videos = library.json()["videos"]

        assert any(
            video["video_id"] == video_id
            for video in videos
        )

        print("LIBRARY OK: video found")
        print("SUPABASE E2E TEST PASSED")

finally:
    # Remove only the test video.
    # Its ingestion job is deleted by ON DELETE CASCADE.
    if video_id is not None:
        response = (
            get_supabase_admin_client()
            .table("videos")
            .delete()
            .eq("video_id", video_id)
            .eq("owner_id", owner_id)
            .execute()
        )

        if not response.data:
            raise RuntimeError(
                "Test cleanup failed. Check the videos table."
            )

        print("TEST CLEANUP OK")
