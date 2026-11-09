
from typing import Literal

from pydantic import BaseModel, Field


class TranscriptUploadResponse(BaseModel):
    """Response returned after successful transcript indexing."""

    video_id: str
    status: Literal["completed"]
    chunks_count: int = Field(ge=1)
