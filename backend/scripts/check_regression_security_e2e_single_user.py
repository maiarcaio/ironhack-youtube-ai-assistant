"""VideoMind AI — backend regression/security end-to-end test.

Run from backend/: python scripts/check_regression_security_e2e.py
Needs ONE Supabase Auth test user. Uses real OpenAI and Pinecone;
creates/deletes a temporary video, job, transcript, chat thread/messages and vectors.
It checks database persistence between requests; it does NOT restart Uvicorn.
"""

import json
import os
import sys
from getpass import getpass
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env", override=True)
os.environ["RUN_INGESTION_WORKER"] = "false"

from fastapi.testclient import TestClient
from pinecone import Pinecone
from supabase import create_client

from app.main import app
from app.services.persistence.supabase_client import get_supabase_admin_client
from app.services.persistence.video_repository import get_video

URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
SRT = """1
00:00:10,000 --> 00:00:16,000
The striker makes a diagonal run behind the defensive line.

2
00:00:20,000 --> 00:00:26,000
The midfielder passes the ball to the striker.

3
00:00:40,000 --> 00:00:47,000
The goalkeeper organizes the defense before a corner kick.

4
00:01:05,000 --> 00:01:12,000
The team presses high to regain possession.
"""


def login():
    print("SUPABASE TEST USER")
    email = input("Email: ").strip()
    password = getpass("Password: ")
    client = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"]
    )
    result = client.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })
    del password
    assert result.session and result.user, "AUTH FAILED"
    return str(result.user.id), {
        "Authorization": "Bearer " + result.session.access_token
    }


def expected(response, status_code, test_label):
    assert response.status_code == status_code, (
        f"{test_label}: expected {status_code}, "
        f"got {response.status_code}: {response.text[:400]}"
    )
    print(test_label, "OK")
    return response


def parse_sse(raw):
    events = []
    for block in raw.replace("\r\n", "\n").split("\n\n"):
        name = None
        data_lines = []
        for line in block.splitlines():
            if line.startswith("event:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].lstrip())
        if name:
            events.append((name, json.loads("\n".join(data_lines))))
    return events


def main():
    owner_a, headers_a = login()
    print("AUTH OK")

    admin = get_supabase_admin_client()
    video_id = None
    test_error = None

    try:
        with TestClient(app) as http:
            # A: create an isolated video and mark its queue job as failed.
            created = expected(http.post(
                "/api/v1/videos/ingest", json={"url": URL}, headers=headers_a,
            ), 202, "CREATE TEST VIDEO")
            video_id = created.json()["video_id"]

            job = (admin.table("ingestion_jobs")
                   .update({"status": "failed", "last_error": "Test only"})
                   .eq("video_id", video_id).eq("owner_id", owner_a)
                   .eq("status", "queued").execute())
            assert len(job.data) == 1, "Queue job was not queued. Stop other workers."

            video = (admin.table("videos")
                     .update({"status": "failed", "error": "Test only"})
                     .eq("video_id", video_id).eq("owner_id", owner_a)
                     .execute())
            assert len(video.data) == 1

            uploaded = expected(http.post(
                "/api/v1/transcripts/upload", headers=headers_a,
                data={"video_id": video_id},
                files={"file": ("security_test.srt", SRT.encode("utf-8"),
                                "application/x-subrip")},
            ), 201, "TRANSCRIPT FIXTURE")
            assert uploaded.json()["chunks_count"] > 0

            # Authentication: no JWT and an invalid JWT cannot access protected routes.
            expected(http.get("/api/v1/videos"), 401, "NO JWT -> 401")
            expected(http.get(
                "/api/v1/videos", headers={"Authorization": "Bearer invalid.jwt.token"}
            ), 401, "INVALID JWT -> 401")
            expected(http.post(
                "/api/v1/chat", json={"video_id": video_id, "message": "Hello"}
            ), 401, "CHAT WITHOUT JWT -> 401")
            expected(http.post(
                "/api/v1/chat/stream", json={"video_id": video_id, "message": "Hello"}
            ), 401, "STREAM WITHOUT JWT -> 401")

            # Single-user authorization checks.
            # A non-existent video must not be accessible.
            unknown_id = str(uuid4())
            expected(http.get(
                f"/api/v1/videos/{unknown_id}/status", headers=headers_a
            ), 404, "UNKNOWN VIDEO STATUS -> 404")
            expected(http.post(
                "/api/v1/chat", headers=headers_a,
                json={"video_id": unknown_id, "message": "What is in this video?"},
            ), 404, "UNKNOWN VIDEO CHAT -> 404")
            expected(http.post(
                "/api/v1/chat/stream", headers=headers_a,
                json={"video_id": unknown_id, "message": "What is in this video?"},
            ), 404, "UNKNOWN VIDEO STREAM -> 404")

            # Repository owner filter, without requiring a second account.
            # This is NOT an end-to-end cross-user authentication test.
            other_owner_id = str(uuid4())
            assert get_video(owner_id=other_owner_id, video_id=video_id) is None
            print("OWNER FILTER OK (repository only)")

            # Input validation (before calling an LLM).
            expected(http.post(
                "/api/v1/chat", headers=headers_a,
                json={"video_id": video_id, "message": ""},
            ), 422, "EMPTY QUESTION -> 422")
            expected(http.post(
    "/api/v1/chat", headers=headers_a,
    json={"video_id": video_id, "message": "Analyze", "response_language": "fr"},
), 501, "UNSUPPORTED RESPONSE LANGUAGE -> 501")

            # Conversation 1: normal grounded response, sources, timestamps.
            question_1 = (
                "Use search_video_transcript: when does the striker make a "
                "diagonal run? Cite the source."
            )
            first = expected(http.post(
                "/api/v1/chat", headers=headers_a,
                json={"video_id": video_id, "message": question_1},
            ), 200, "CHAT TURN 1 -> 200").json()
            thread_id = first["thread_id"]
            assert thread_id and first["answer"].strip()
            assert first["sources"], "Chat did not return retrieved sources"
            assert any(s.get("start_seconds") is not None for s in first["sources"])
            print("CHAT SOURCES + TIMESTAMPS OK")

        # A NEW TestClient session checks the same thread through real Supabase state.
        # This is not a full Uvicorn/process restart.
        with TestClient(app) as http:
            question_2 = (
                "Use search_video_transcript: who passes the ball to the striker "
                "after the diagonal run?"
            )
            second = expected(http.post(
                "/api/v1/chat", headers=headers_a,
                json={"video_id": video_id, "message": question_2,
                      "thread_id": thread_id},
            ), 200, "CHAT TURN 2 -> 200").json()
            assert second["thread_id"] == thread_id
            assert second["answer"].strip()

            # DB verification of persistent conversation and message records.
            thread_rows = (admin.table("chat_threads").select("*")
                           .eq("video_id", video_id).eq("owner_id", owner_a)
                           .execute().data)
            assert any(str(row.get("id")) == str(thread_id) for row in thread_rows), "Thread not stored in Supabase"
            messages = (admin.table("chat_messages").select("*")
                        .eq("thread_id", thread_id).execute().data)
            assert len(messages) >= 4, (
                f"Expected two user+assistant turns (4 messages), got {len(messages)}"
            )
            print("SUPABASE CHAT MEMORY OK: 1 thread, >=4 messages")

            # Streaming: meta -> tokens -> sources -> done, no error.
            stream = expected(http.post(
                "/api/v1/chat/stream", headers=headers_a,
                json={
                    "video_id": video_id,
                    "message": (
                        "Use search_video_transcript: at what time does the "
                        "team press high? Cite the source."
                    ),
                },
            ), 200, "SSE HTTP 200")
            assert stream.headers.get("content-type", "").startswith(
                "text/event-stream"
            ), "Invalid SSE Content-Type"
            events = parse_sse(stream.text)
            kinds = [name for name, _ in events]
            assert "error" not in kinds, f"SSE error: {events}"
            assert all(x in kinds for x in ("meta", "token", "sources", "done")), kinds
            assert kinds.index("meta") < kinds.index("done")
            meta = next(payload for name, payload in events if name == "meta")
            done = next(payload for name, payload in events if name == "done")
            sources = next(payload for name, payload in events if name == "sources")
            tokens = "".join(data.get("text", "") for name, data in events
                             if name == "token")
            assert meta["video_id"] == video_id
            assert done["thread_id"] == meta["thread_id"]
            assert tokens.strip() and done["answer"].strip()
            assert sources["sources"], "SSE emitted no sources"
            assert any(item.get("start_seconds") is not None
                       for item in sources["sources"])
            print("SSE META/TOKEN/SOURCES/DONE + TIMESTAMPS OK")

            print("REGRESSION E2E PASSED")

    except Exception as exc:
        test_error = exc
        raise
    finally:
        cleanup_errors = []
        if video_id:
            try:
                Pinecone(api_key=os.environ["PINECONE_API_KEY"]).Index(
                    os.environ["PINECONE_INDEX_NAME"]
                ).delete(
                    filter={
                        "video_id": {"$eq": video_id},
                        "owner_id": {"$eq": owner_a},
                    },
                    namespace="videomind-dev",
                )
                print("PINECONE CLEANUP OK")
            except Exception as exc:
                cleanup_errors.append(f"Pinecone: {exc}")

            try:
                deleted = (admin.table("videos").delete()
                           .eq("video_id", video_id).eq("owner_id", owner_a)
                           .execute())
                if not deleted.data:
                    raise RuntimeError("Video deletion returned no rows")
                print("SUPABASE CLEANUP OK")
            except Exception as exc:
                cleanup_errors.append(f"Supabase: {exc}")

        if cleanup_errors:
            print("CLEANUP FAILED: " + "; ".join(cleanup_errors))
            if test_error is None:
                raise RuntimeError("; ".join(cleanup_errors))


if __name__ == "__main__":
    main()
