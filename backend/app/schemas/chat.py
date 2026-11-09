
from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class ChatV1Request(BaseModel):
    video_id: str = Field(min_length=1)
    message: str = Field(min_length=1)
    thread_id: str | None = None
    analysis_mode: Literal["auto", "deep"] = "auto"
    response_language: str | None = None


class ChatSource(BaseModel):
    chunk_id: str
    excerpt: str
    start_seconds: float | None = None
    end_seconds: float | None = None
    source_type: Literal["transcript", "frame"] = "transcript"


class ChatV1Response(BaseModel):
    video_id: str
    thread_id: str
    answer: str
    sources: list[ChatSource]
    insufficient_evidence: bool
    model_used: str | None = None
