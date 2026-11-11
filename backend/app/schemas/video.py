from datetime import datetime
from typing import Literal

from pydantic import BaseModel, HttpUrl


class IngestVideoRequest(BaseModel):
    url: HttpUrl


class IngestVideoResponse(BaseModel):
    video_id: str
    status: Literal["queued"]


class VideoStatusResponse(BaseModel):
    video_id: str
    status: Literal["queued", "processing", "completed", "failed"]
    error: str | None = None


class VideoItem(BaseModel):
    video_id: str
    title: str
    status: Literal["queued", "processing", "completed", "failed"]
    source_url: str | None = None
    archived_at: datetime | None = None


class VideoListResponse(BaseModel):
    videos: list[VideoItem]
