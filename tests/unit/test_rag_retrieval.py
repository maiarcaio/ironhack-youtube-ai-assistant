
from types import SimpleNamespace

from langchain_core.documents import Document

import app.services.retrieval.rag as rag



class FakeStore:
    """Simulate vector retrieval with similarity scores."""

    def __init__(self, documents, scores=None):
        self.documents = documents
        self.scores = scores or {}
        self.last_filter = None

    def similarity_search_with_score(self, query, k, filter):
        self.last_filter = filter

        matches = [
            document
            for document in self.documents
            if all(
                document.metadata.get(key) == condition["$eq"]
                for key, condition in filter.items()
            )
        ]

        return [
            (
                document,
                self.scores.get(
                    document.metadata.get("chunk_id"),
                    0.8,
                ),
            )
            for document in matches[:k]
        ]



class FakeLLM:
    """Simulate the LLM without API calls."""

    def __init__(self, **kwargs):
        pass

    def invoke(self, messages):
        return SimpleNamespace(
            content="AI helps analyze tactics. [chunk-001]"
        )


def test_retrieval_preserves_timestamps(monkeypatch):
    document = Document(
        page_content="AI helps analyze football tactics.",
        metadata={
            "video_id": "video-001",
            "owner_id": "user-001",
            "chunk_id": "chunk-001",
            "source_type": "transcript",
            "start_seconds": 85.0,
            "end_seconds": 91.0,
        },
    )

    store = FakeStore([document])

    monkeypatch.setattr(rag, "get_vector_store", lambda: store)
    monkeypatch.setattr(rag, "ChatOpenAI", FakeLLM)

    result = rag.answer_from_video(
        question="How can AI help coaches?",
        video_id="video-001",
        owner_id="user-001",
    )

    assert result["sources"][0]["start_seconds"] == 85.0
    assert result["sources"][0]["end_seconds"] == 91.0
    assert result["sources"][0]["chunk_id"] == "chunk-001"
    assert result["insufficient_evidence"] is False


def test_retrieval_isolates_videos_and_users(monkeypatch):
    documents = [
        Document(
            page_content="Correct video evidence.",
            metadata={
                "video_id": "video-001",
                "owner_id": "user-001",
                "chunk_id": "correct-chunk",
            },
        ),
        Document(
            page_content="Another user's private content.",
            metadata={
                "video_id": "video-001",
                "owner_id": "user-002",
                "chunk_id": "private-chunk",
            },
        ),
        Document(
            page_content="Another video's content.",
            metadata={
                "video_id": "video-002",
                "owner_id": "user-001",
                "chunk_id": "other-video-chunk",
            },
        ),
    ]

    store = FakeStore(documents)

    monkeypatch.setattr(rag, "get_vector_store", lambda: store)
    monkeypatch.setattr(rag, "ChatOpenAI", FakeLLM)

    result = rag.answer_from_video(
        question="What does the video explain?",
        video_id="video-001",
        owner_id="user-001",
    )

    assert len(result["sources"]) == 1
    assert result["sources"][0]["chunk_id"] == "correct-chunk"

    assert store.last_filter == {
        "video_id": {"$eq": "video-001"},
        "owner_id": {"$eq": "user-001"},
    }


def test_no_evidence_skips_llm(monkeypatch):
    store = FakeStore([])

    monkeypatch.setattr(rag, "get_vector_store", lambda: store)

    def unexpected_llm_call(**kwargs):
        raise AssertionError("LLM should not be called.")

    monkeypatch.setattr(
        rag,
        "ChatOpenAI",
        unexpected_llm_call,
    )

    result = rag.answer_from_video(
        question="What does this video explain?",
        video_id="video-unknown",
        owner_id="user-001",
    )

    assert result["insufficient_evidence"] is True
    assert result["sources"] == []
    assert result["model_used"] is None


def test_low_similarity_rejects_evidence(monkeypatch):
    """Reject irrelevant retrieval results before calling the LLM."""

    document = Document(
        page_content="Instructions for baking a chocolate cake.",
        metadata={
            "video_id": "video-001",
            "owner_id": "user-001",
            "chunk_id": "irrelevant-chunk",
        },
    )

    store = FakeStore(
        documents=[document],
        scores={"irrelevant-chunk": 0.0423},
    )

    monkeypatch.setattr(
        rag,
        "get_vector_store",
        lambda: store,
    )

    def unexpected_llm_call(**kwargs):
        raise AssertionError(
            "LLM must not be called for irrelevant evidence."
        )

    monkeypatch.setattr(
        rag,
        "ChatOpenAI",
        unexpected_llm_call,
    )

    result = rag.answer_from_video(
        question="How can AI help football coaches?",
        video_id="video-001",
        owner_id="user-001",
    )

    assert result["insufficient_evidence"] is True
    assert result["sources"] == []
    assert result["model_used"] is None

    print("LOW SIMILARITY FILTER OK")
