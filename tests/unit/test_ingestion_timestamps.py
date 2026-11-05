
import pytest

from app.services.ingestion.pipeline import ingest_transcript


SRT_SAMPLE = """1
00:00:05,000 --> 00:00:09,500
AI helps football coaches.

2
00:01:25,000 --> 00:01:31,000
AI analyzes player positioning.
"""

VTT_SAMPLE = """WEBVTT

00:00:05.000 --> 00:00:09.500
AI helps football coaches.

00:01:25.000 --> 00:01:31.000
AI analyzes player positioning.
"""


class FakeStore:
    """Capture documents without calling Pinecone."""

    def __init__(self):
        self.documents = []
        self.ids = []

    def add_documents(self, documents, ids):
        self.documents = documents
        self.ids = ids


@pytest.mark.parametrize(
    "extension,content,expected_timestamps",
    [
        ("srt", SRT_SAMPLE, [(5.0, 9.5), (85.0, 91.0)]),
        ("vtt", VTT_SAMPLE, [(5.0, 9.5), (85.0, 91.0)]),
        ("txt", "AI helps football coaches.", None),
    ],
)
def test_transcript_ingestion(
    tmp_path,
    monkeypatch,
    extension,
    content,
    expected_timestamps,
):
    """Verify transcript formats and timestamp preservation."""

    file_path = tmp_path / f"sample.{extension}"
    file_path.write_text(content, encoding="utf-8")

    store = FakeStore()

    monkeypatch.setattr(
        "app.services.ingestion.pipeline.get_vector_store",
        lambda: store,
    )

    count = ingest_transcript(
        file_path=str(file_path),
        video_id="test-video",
        owner_id="test-user",
    )

    assert count == len(store.documents)
    assert count > 0

    for index, document in enumerate(store.documents):
        expected_id = f"test-user:test-video:{index:04d}"

        assert store.ids[index] == expected_id
        assert document.metadata["chunk_id"] == expected_id
        assert document.metadata["video_id"] == "test-video"
        assert document.metadata["owner_id"] == "test-user"
        assert document.metadata["source_type"] == "transcript"

    if expected_timestamps is not None:
        actual = [
            (
                document.metadata["start_seconds"],
                document.metadata["end_seconds"],
            )
            for document in store.documents
        ]

        assert actual == expected_timestamps
    else:
        assert all(
            "start_seconds" not in document.metadata
            for document in store.documents
        )
        assert all(
            "end_seconds" not in document.metadata
            for document in store.documents
        )
