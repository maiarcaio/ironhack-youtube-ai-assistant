
"""Run VideoMind AI RAG evaluation with LangSmith."""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")

from langchain_core.messages import ToolMessage
from langsmith import Client

from app.services.agents.agent import (
    create_video_agent,
    extract_agent_answer,
)
from app.services.agents.evidence import (
    EVIDENCE_TOOLS,
    extract_tool_sources,
)
from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)
from rag_evaluators import evaluate_rag_answer


DATASET_NAME = "videomind-open-university-v1"
VIDEO_ID = "9c49117b-ffd9-480c-a359-887a3607bbbc"


def get_video_owner():
    """Find the owner of the completed evaluation video."""

    result = (
        get_supabase_admin_client()
        .table("videos")
        .select("owner_id,status")
        .eq("video_id", VIDEO_ID)
        .single()
        .execute()
    )

    video = result.data

    if not video or video["status"] != "completed":
        raise RuntimeError("Evaluation video is not completed.")

    return video["owner_id"]


def create_prediction_function(owner_id):
    """Create a stateless RAG prediction function."""

    agent = create_video_agent(
        video_id=VIDEO_ID,
        owner_id=owner_id,
        checkpointer=None,
    )

    def predict(inputs: dict) -> dict:
        """Run the agent and collect retrieved evidence."""

        result = agent.invoke({
            "messages": [
                {
                    "role": "user",
                    "content": inputs["question"],
                }
            ]
        })

        answer = extract_agent_answer(result)

        sources = []
        seen_chunks = set()

        for message in result["messages"]:
            if not isinstance(message, ToolMessage):
                continue

            if message.name not in EVIDENCE_TOOLS:
                continue

            if not isinstance(message.content, str):
                continue

            evidence = extract_tool_sources(
                tool_name=message.name,
                content=message.content,
                video_id=VIDEO_ID,
            )

            for source in evidence:
                chunk_id = source["chunk_id"]

                if chunk_id not in seen_chunks:
                    seen_chunks.add(chunk_id)
                    sources.append(source)

        return {
            "answer": answer,
            "sources": sources,
        }

    return predict


def main():
    """Evaluate six RAG questions and publish LangSmith scores."""

    required_keys = (
        "OPENAI_API_KEY",
        "LANGSMITH_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
        "PINECONE_API_KEY",
    )

    missing = [
        key for key in required_keys
        if not os.getenv(key)
    ]

    if missing:
        raise RuntimeError(
            f"Missing environment variables: {', '.join(missing)}"
        )

    client = Client()

    dataset = client.read_dataset(
        dataset_name=DATASET_NAME
    )

    examples = list(
        client.list_examples(dataset_id=dataset.id)
    )

    if len(examples) != 6:
        raise RuntimeError(
            f"Expected 6 examples, found {len(examples)}."
        )

    owner_id = get_video_owner()
    predict = create_prediction_function(owner_id)

    print("Starting VideoMind AI RAG evaluation...")
    print(f"Dataset: {DATASET_NAME}")
    print("Questions: 6")
    print("Metrics: correctness, groundedness, retrieval_relevance")

    results = client.evaluate(
        predict,
        data=DATASET_NAME,
        evaluators=[evaluate_rag_answer],
        experiment_prefix="videomind-rag-local",
        description="VideoMind AI Open University RAG evaluation",
        metadata={
            "video_id": VIDEO_ID,
            "environment": "local",
        },
        max_concurrency=1,
        num_repetitions=1,
        blocking=True,
    )

    completed = sum(1 for _ in results)

    print(f"Evaluation rows processed: {completed}")
    print("Review scores and traces in LangSmith.")


if __name__ == "__main__":
    main()
