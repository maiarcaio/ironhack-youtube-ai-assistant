
"""Controlled end-to-end test of the ingestion worker."""

import os
import sys
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path
from unittest.mock import patch

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env", override=True)

from fastapi.testclient import TestClient
from supabase import create_client

from app.main import app
from app.services.ingestion.worker import process_next_job
from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)


TEST_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def main() -> None:
    admin = get_supabase_admin_client()

    # Do not accidentally process another user's queued job.
    pending = (
        admin.table("ingestion_jobs")
        .select("id")
        .eq("status", "queued")
        .limit(1)
        .execute()
    )

    if pending.data:
        raise RuntimeError(
            "Other queued jobs exist. Test stopped for safety."
        )

    email = input("Test user email: ").strip()
    password = getpass("Test user password: ")

    auth_client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_PUBLISHABLE_KEY"],
    )

    login = auth_client.auth.sign_in_with_password(
        {"email": email, "password": password}
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
            print("VIDEO QUEUED OK")


            now = datetime.now(timezone.utc).isoformat()

            job_debug = (
                admin.table("ingestion_jobs")
                .select("id,status,available_at,attempts")
                .eq("video_id", video_id)
                .execute()
            )

            eligible_debug = (
                admin.table("ingestion_jobs")
                .select("id")
                .eq("video_id", video_id)
                .eq("status", "queued")
                .lte("available_at", now)
                .execute()
            )

            print("JOB IN DATABASE:", job_debug.data)
            print("LOCAL UTC:", now)
            print("JOB ELIGIBLE:", bool(eligible_debug.data))


            def fake_ingestion(
                *,
                url: str,
                owner_id: str,
                library_video_id: str,
            ) -> dict:
                assert url == TEST_URL
                assert owner_id == str(login.user.id)
                assert library_video_id == video_id

                return {
                    "video_id": library_video_id,
                    "status": "completed",
                    "chunks_count": 2,
                }

            # Only the external ingestion step is simulated.
            # Supabase operations and worker transitions are real.
            with patch(
                "app.services.ingestion.worker.ingest_youtube_captions",
                side_effect=fake_ingestion,
            ):
                result = process_next_job()

            if result is None:
                raise RuntimeError("Worker did not claim the job.")

            if (
                result["video_id"] != video_id
                or result["status"] != "completed"
            ):
                raise RuntimeError(
                    f"Unexpected worker result: {result}"
                )

            print("WORKER PROCESSING OK")

            video_response = http.get(
                f"/api/v1/videos/{video_id}/status",
                headers=headers,
            )

            assert video_response.status_code == 200
            assert video_response.json()["status"] == "completed"

            print("VIDEO STATUS OK: completed")

            jobs = (
                admin.table("ingestion_jobs")
                .select("status,attempts")
                .eq("video_id", video_id)
                .limit(1)
                .execute()
            )

            assert len(jobs.data) == 1
            assert jobs.data[0]["status"] == "completed"
            assert jobs.data[0]["attempts"] == 1

            print("JOB STATUS OK: completed")
            print("WORKER E2E TEST PASSED")

    finally:
        if video_id is not None:
            deleted = (
                admin.table("videos")
                .delete()
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .execute()
            )

            if not deleted.data:
                raise RuntimeError(
                    "Test cleanup failed. Check Supabase."
                )

            print("TEST CLEANUP OK")


if __name__ == "__main__":
    main()
