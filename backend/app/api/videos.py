from fastapi import APIRouter, HTTPException, status

from app.schemas.video import IngestVideoRequest, IngestVideoResponse, VideoStatusResponse

from app.schemas.video import VideoListResponse

router = APIRouter(
    prefix="/api/v1/videos",
    tags=["Videos"]
)


@router.post(
    "/ingest",
    response_model=IngestVideoResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={501: {"description": "Ingestion not implemented yet"}}
)
def ingest_video(request: IngestVideoRequest):
    """
    Receive a video ingestion request.

    The ingestion pipeline will be connected later.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Video ingestion is not implemented yet."
    )


@router.get(
    "/{video_id}/status",
    response_model=VideoStatusResponse,
    responses={501: {"description": "Status lookup not implemented yet"}}
)
def get_video_status(video_id: str):
    """
    Get the ingestion status of a video.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Video status lookup is not implemented yet."
    )


@router.get(
    "",
    response_model=VideoListResponse,
    responses={501: {"description": "Library not implemented yet"}}
)
def list_videos():
    """List videos belonging to the authenticated user."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Video library is not implemented yet."
    )
