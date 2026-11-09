
"""Create the VideoMind AI evaluation dataset."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from langsmith import Client


BACKEND_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = BACKEND_DIR.parents[1] / "videomind-test-assets"

DATASET_NAME = "videomind-open-university-v1"
QUESTIONS_FILE = ASSETS_DIR / "evaluation_questions.json"


def main():
    load_dotenv(BACKEND_DIR / ".env")

    if not os.getenv("LANGSMITH_API_KEY"):
        raise RuntimeError("LANGSMITH_API_KEY is missing.")

    if not QUESTIONS_FILE.exists():
        raise FileNotFoundError(
            f"Questions file not found: {QUESTIONS_FILE}"
        )

    data = json.loads(
        QUESTIONS_FILE.read_text(encoding="utf-8")
    )

    questions = data["questions"]

    if len(questions) != 6:
        raise ValueError("Expected exactly 6 questions.")

    client = Client()

    if client.has_dataset(dataset_name=DATASET_NAME):
        dataset = client.read_dataset(
            dataset_name=DATASET_NAME
        )

        existing = list(
            client.list_examples(dataset_id=dataset.id)
        )

        print(f"Dataset already exists: {DATASET_NAME}")
        print(f"Examples: {len(existing)}")

        if len(existing) != 6:
            raise RuntimeError(
                "Dataset exists but does not contain 6 examples."
            )

        return

    dataset = client.create_dataset(
        dataset_name=DATASET_NAME,
        description=(
            "RAG evaluation for the Open University "
            "video Can AI be creative?"
        ),
    )

    examples = []

    for item in questions:
        examples.append({
            "inputs": {
                "question": item["question"],
            },
            "reference_outputs": {
                "answer": item["reference_answer"],
                "answerable": item["answerable"],
                "evidence": item["evidence"],
            },
            "metadata": {
                "question_id": item["id"],
                "video_url": data["video_url"],
            },
        })

    client.create_examples(
        dataset_id=dataset.id,
        examples=examples,
    )

    print(f"Dataset created: {DATASET_NAME}")
    print(f"Examples created: {len(examples)}")
    print("No OpenAI model calls were made.")


if __name__ == "__main__":
    main()
