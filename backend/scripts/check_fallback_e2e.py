
"""Real Supabase and Pinecone transcript fallback test."""

import os
import sys
import time
from getpass import getpass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env", override=True)

from fastapi.testclient import TestClient
from pinecone import Pinecone
from supabase import create_client

from app.main import app
from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from app.services.retrieval.vector_store import get_vector_store


TEST_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

SRT = """1
00:01:25,000 --> 00:01:30,000
The striker makes a diagonal run behind the defensive line.

2
00:01:31,000 --> 00:01:36,000
The midfielder plays a through ball into the striker's path.
"""


def main():
    email = input("Test user email: ").strip()
    password = getpass("Test user password: ")

    auth = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_PUBLISHABLE_KEY"],
    )

    login = auth.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })
    del password

    if login.session is None or login.user is None:
        raise RuntimeError("Authentication failed.")

    owner_id = str(login.user.id)
    headers = {
        "Authorization": f"Bearer {login.session.access_token}"
    }

    admin = get_supabase_admin_client()
    video_id = None

    print("AUTH OK")

    try:
        with TestClient(app) as http:
            # Register a real video.
            response = http.post(
                "/api/v1/videos/ingest",
                json={"url": TEST_URL},
                headers=headers,
            )

            assert response.status_code == 202, response.text
            video_id = response.json()["video_id"]

            print("VIDEO CREATED OK")

            # Simulate unavailable YouTube captions.
            job = (
                admin.table("ingestion_jobs")
                .update({
                    "status": "failed",
                    "last_error": "Captions unavailable.",
                })
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .eq("status", "queued")
                .execute()
            )

            assert len(job.data) == 1

            video = (
                admin.table("videos")
                .update({
                    "status": "failed",
                    "error": "Captions unavailable.",
                })
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .execute()
            )

            assert len(video.data) == 1

            print("YOUTUBE FAILURE SIMULATED")

            # Upload and index the real SRT transcript.
            upload = http.post(
                "/api/v1/transcripts/upload",
                headers=headers,
                data={"video_id": video_id},
                files={
                    "file": (
                        "test_fallback.srt",
                        SRT.encode("utf-8"),
                        "application/x-subrip",
                    )
                },
            )

            assert upload.status_code == 201, upload.text
            assert upload.json()["status"] == "completed"

            print("TRANSCRIPT UPLOAD OK")

            # Check real PostgreSQL persistence.
            stored_video = (
                admin.table("videos")
                .select("status")
                .eq("video_id", video_id)
                .execute()
            )

            stored_job = (
                admin.table("ingestion_jobs")
                .select("status")
                .eq("video_id", video_id)
                .execute()
            )

            stored_transcript = (
                admin.table("transcripts")
                .select("format,source")
                .eq("video_id", video_id)
                .execute()
            )

            assert stored_video.data[0]["status"] == "completed"
            assert stored_job.data[0]["status"] == "completed"
            assert stored_transcript.data[0]["format"] == "srt"
            assert stored_transcript.data[0]["source"] == "upload"

            print("SUPABASE PERSISTENCE OK")

            # Verify real retrieval from Pinecone.
            store = get_vector_store()
            documents = []

            for attempt in range(4):
                documents = store.similarity_search(
                    "What run does the striker make?",
                    k=2,
                    filter={
                        "video_id": {"$eq": video_id},
                        "owner_id": {"$eq": owner_id},
                    },
                )

                if documents:
                    break

                time.sleep(2)

            assert documents, "No matching vectors found in Pinecone."

            assert all(
                doc.metadata["video_id"] == video_id
                and doc.metadata["owner_id"] == owner_id
                for doc in documents
            )

            assert any(
                doc.metadata.get("start_seconds") == 85.0
                for doc in documents
            )

            print("PINECONE RETRIEVAL OK")
            print("TIMESTAMPS OK")


            payload = {
                "video_id": video_id,
                "message": "When does the striker make a diagonal run?",
                "analysis_mode": "auto",
            }

            unauthorized = http.post(
                "/api/v1/chat",
                json=payload,
            )
            assert unauthorized.status_code == 401
            print("CHAT AUTH SECURITY OK")

            unauthorized_stream = http.post(
                "/api/v1/chat/stream",
                json=payload,
            )
            assert unauthorized_stream.status_code == 401
            print("STREAM AUTH SECURITY OK")

            # 2. Reject access to a video outside the user's library.
            missing_video = http.post(
                "/api/v1/chat",
                json={**payload, "video_id": "unknown-video-id"},
                headers=headers,
            )
            assert missing_video.status_code == 404
            print("VIDEO ACCESS CHECK OK")

            # 3. Real agent response with the authenticated user.
            chat_response = http.post(
                "/api/v1/chat",
                json=payload,
                headers=headers,
            )
            assert chat_response.status_code == 200, chat_response.text
            assert chat_response.json()["answer"].strip()
            assert chat_response.json()["sources"]
            print("REAL CHAT OK")

            # 4. Real SSE streaming response.
            stream_response = http.post(
                "/api/v1/chat/stream",
                json=payload,
                headers=headers,
            )
            assert stream_response.status_code == 200, stream_response.text
            assert "event: token" in stream_response.text
            assert "event: sources" in stream_response.text
            assert "event: done" in stream_response.text

            print("REAL STREAMING OK")
            print("CHAT + STREAM SECURITY E2E PASSED")


    finally:
        if video_id is not None:
            # Delete only this test video's vectors.
            try:
                pc = Pinecone(
                    api_key=os.environ["PINECONE_API_KEY"]
                )

                pc.Index(
                    os.environ["PINECONE_INDEX_NAME"]
                ).delete(
                    filter={
                        "video_id": {"$eq": video_id},
                        "owner_id": {"$eq": owner_id},
                    },
                    namespace="videomind-dev",
                )

                print("PINECONE CLEANUP OK")

            except Exception as exc:
                print(
                    "WARNING: Pinecone cleanup failed:",
                    str(exc),
                )

            # Database cascade removes the job and transcript.
            deleted = (
                admin.table("videos")
                .delete()
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .execute()
            )

            if not deleted.data:
                raise RuntimeError(
                    "Supabase cleanup failed."
                )

            print("SUPABASE CLEANUP OK")


if __name__ == "__main__":
    main()
