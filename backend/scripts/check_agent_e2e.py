
"""VideoMind AI: six LangChain tools + multi-tool + grounded chat E2E.

Run from backend/: python scripts/check_agent_e2e.py
Uses temporary Supabase videos and Pinecone vectors.
Costs: real OpenAI embeddings and model calls.
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
from langchain_core.messages import ToolMessage
from pinecone import Pinecone
from supabase import create_client

from app.main import app
from app.services.agents.agent import create_video_agent
from app.services.agents.chat_service import answer_with_agent
from app.services.agents.tools import (
    create_video_search_tool,
    create_video_metadata_tool,
    create_video_moments_tool,
    create_topic_comparison_tool,
    create_exact_phrase_tool,
    create_transcript_overview_tool,
)
from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from app.services.persistence.video_repository import create_video


SRT = """1
00:00:10,000 --> 00:00:16,000
The striker makes a diagonal run behind the defensive line.

2
00:00:20,000 --> 00:00:26,000
The midfielder plays a through ball to the striker.

3
00:00:40,000 --> 00:00:47,000
The goalkeeper organizes the defense before a corner kick.

4
00:01:05,000 --> 00:01:12,000
The team presses high to regain possession.
"""

URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def check_tool(label, tool, arguments):
    result = tool.invoke(arguments)

    payload = (
        json.loads(result)
        if isinstance(result, str)
        else result
    )

    assert isinstance(payload, dict) and payload, (
        label, result
    )
    assert not payload.get("error"), (label, payload)

    print(
        "TOOL OK:",
        label,
        "|",
        json.dumps(payload, ensure_ascii=False)[:160],
    )

    return payload


def main():
    email = input("Test user email: ").strip()
    password = getpass("Password: ")

    auth = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_PUBLISHABLE_KEY"],
    )

    session = auth.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })

    del password

    assert session.session and session.user, (
        "Supabase login failed"
    )

    owner_id = str(session.user.id)

    headers = {
        "Authorization": (
            "Bearer " + session.session.access_token
        )
    }

    admin = get_supabase_admin_client()

    video_id = None
    empty_video_id = None

    print("AUTH OK")

    try:
        with TestClient(app) as http:

            # 1. Create temporary video
            response = http.post(
                "/api/v1/videos/ingest",
                json={"url": URL},
                headers=headers,
            )

            assert response.status_code == 202, (
                response.text
            )

            video_id = response.json()["video_id"]

            # 2. Simulate ingestion failure
            job = (
                admin.table("ingestion_jobs")
                .update({
                    "status": "failed",
                    "last_error": "Test only",
                })
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .eq("status", "queued")
                .execute()
            )

            assert len(job.data) == 1, (
                "Job state was not queued"
            )

            video = (
                admin.table("videos")
                .update({
                    "status": "failed",
                    "error": "Test only",
                })
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .execute()
            )

            assert len(video.data) == 1

            # 3. Upload SRT and index in Pinecone
            upload = http.post(
                "/api/v1/transcripts/upload",
                headers=headers,
                data={"video_id": video_id},
                files={
                    "file": (
                        "agent_test.srt",
                        SRT.encode(),
                        "application/x-subrip",
                    )
                },
            )

            assert upload.status_code == 201, (
                upload.text
            )

            assert upload.json()["chunks_count"] > 0

            print(
                "FIXTURE READY: SRT + SUPABASE + PINECONE"
            )

            # 4. Test six LangChain tools
            tools = [
                (
                    "search_video_transcript",
                    create_video_search_tool(
                        video_id, owner_id
                    ),
                    {"query": "striker diagonal run"},
                ),
                (
                    "get_video_metadata",
                    create_video_metadata_tool(
                        video_id, owner_id
                    ),
                    {},
                ),
                (
                    "find_video_moments",
                    create_video_moments_tool(
                        video_id, owner_id
                    ),
                    {
                        "query": "striker diagonal run",
                        "start_seconds": 0,
                        "end_seconds": 60,
                    },
                ),
                (
                    "compare_video_topics",
                    create_topic_comparison_tool(
                        video_id, owner_id
                    ),
                    {
                        "topic_a": "diagonal run",
                        "topic_b": "goalkeeper corner kick",
                    },
                ),
                (
                    "find_exact_transcript_phrase",
                    create_exact_phrase_tool(
                        video_id, owner_id
                    ),
                    {"phrase": "diagonal run"},
                ),
                (
                    "get_transcript_overview",
                    create_transcript_overview_tool(
                        video_id, owner_id
                    ),
                    {},
                ),
            ]

            for name, tool, arguments in tools:
                assert tool.name == name, (
                    name, tool.name
                )

                result = check_tool(
                    name, tool, arguments
                )

                if name == "search_video_transcript":
                    assert result.get("results"), (
                        "No transcript evidence found"
                    )

            # 5. Multi-tool agent test
            agent = create_video_agent(
                video_id, owner_id
            )

            combined = agent.invoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": (
                                "Use get_video_metadata and "
                                "compare_video_topics to compare "
                                "the striker's diagonal run with "
                                "the goalkeeper's corner kick. "
                                "Give the video title and cite "
                                "timestamped evidence."
                            ),
                        }
                    ]
                },
                config={
                    "configurable": {
                        "thread_id": str(uuid4())
                    }
                },
            )

            called = {
                m.name
                for m in combined["messages"]
                if isinstance(m, ToolMessage) and m.name
            }

            assert len(called) >= 2, (
                f"Only these tools were called: "
                f"{sorted(called)}"
            )

            print(
                "MULTI-TOOL OK:",
                ", ".join(sorted(called)),
            )

            # 6. Verify API sources and timestamps
            chat = http.post(
                "/api/v1/chat",
                headers=headers,
                json={
                    "video_id": video_id,
                    "message": (
                        "Use search_video_transcript: "
                        "at what time does the striker "
                        "run diagonally? Cite the source chunk."
                    ),
                    "analysis_mode": "auto",
                },
            )

            assert chat.status_code == 200, chat.text

            data = chat.json()

            assert data["sources"], data

            assert all(
                source.get("chunk_id")
                for source in data["sources"]
            ), data

            assert any(
                source.get("start_seconds") is not None
                for source in data["sources"]
            ), data

            print("API SOURCES + TIMESTAMPS OK")

            # 7. No-evidence test (corrected)
            # Create a valid Supabase video without vectors.
            # This prevents the foreign key constraint error.

            empty_video = create_video(
                owner_id=owner_id,
                source_type="upload",
                title="No-evidence test",
            )

            empty_video_id = empty_video["video_id"]

            missing = answer_with_agent(
                question=(
                    "Use search_video_transcript: "
                    "what does this video say about "
                    "an alien football league?"
                ),
                video_id=empty_video_id,
                owner_id=owner_id,
            )

            assert missing["sources"] == [], missing

            assert (
                missing["insufficient_evidence"] is True
            ), missing

            print("INSUFFICIENT EVIDENCE OK")

            print(
                "NO-EVIDENCE ANSWER:",
                missing["answer"][:180],
            )

            print("AGENT E2E PASSED")

    finally:
        # 8. Remove no-evidence test video
        if empty_video_id:
            deleted_empty = (
                admin.table("videos")
                .delete()
                .eq("video_id", empty_video_id)
                .eq("owner_id", owner_id)
                .execute()
            )

            assert deleted_empty.data, (
                "EMPTY VIDEO CLEANUP FAILED"
            )

            print("EMPTY VIDEO CLEANUP OK")

        # 9. Remove Pinecone vectors and main test video
        if video_id:
            try:
                Pinecone(
                    api_key=os.environ["PINECONE_API_KEY"]
                ).Index(
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
                    "PINECONE CLEANUP FAILED:",
                    exc,
                )

            deleted = (
                admin.table("videos")
                .delete()
                .eq("video_id", video_id)
                .eq("owner_id", owner_id)
                .execute()
            )

            assert deleted.data, (
                "SUPABASE CLEANUP FAILED"
            )

            print("SUPABASE CLEANUP OK")


if __name__ == "__main__":
    main()
