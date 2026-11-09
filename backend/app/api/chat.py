
"""Authenticated chat and streaming endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.auth import get_current_user_id
from app.schemas.chat import (ChatRequest, ChatV1Request, ChatV1Response)


from app.services.agents.chat_service import answer_with_agent
from app.services.agents.stream_service import stream_agent_response
from app.services.persistence.video_repository import get_video


router = APIRouter(tags=["Chat"])

CurrentUserId = Annotated[str, Depends(get_current_user_id)]


def _validate_chat_request(request: ChatV1Request) -> None:
    """Reject unsupported options and invalid questions."""

    if request.response_language is not None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Explicit response language is not implemented yet.",
        )

    if not request.message.strip() or len(request.message) > 500:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question must contain 1-500 characters.",
        )


def _require_completed_video(
    owner_id: str,
    video_id: str,
) -> None:
    """Verify ownership and ensure the video is ready for chat."""

    video = get_video(
        owner_id=owner_id,
        video_id=video_id,
    )

    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found.",
        )

    if video["status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video is not ready for chat.",
        )


@router.post("/chat")
def chat(
    request: ChatRequest,
    owner_id: CurrentUserId,
):
    """Legacy echo endpoint, restricted to authenticated users."""

    return {
        "reply": f"You asked: {request.message}"
    }


@router.post(
    "/api/v1/chat",
    response_model=ChatV1Response,
)
def chat_v1(
    request: ChatV1Request,
    owner_id: CurrentUserId,
):
    """Answer questions about an authenticated user's video."""

    _validate_chat_request(request)

    _require_completed_video(
        owner_id=owner_id,
        video_id=request.video_id,
    )

    result = answer_with_agent(
        question=request.message,
        video_id=request.video_id,
        owner_id=owner_id,
        thread_id=request.thread_id,
        analysis_mode=request.analysis_mode,
    )

    return ChatV1Response(
        video_id=request.video_id,
        thread_id=result["thread_id"],
        answer=result["answer"],
        sources=result["sources"],
        insufficient_evidence=result["insufficient_evidence"],
        model_used=result["model_used"],
    )


@router.post("/api/v1/chat/stream")
def chat_stream(
    request: ChatV1Request,
    owner_id: CurrentUserId,
):
    """Stream answers only for videos owned by the current user."""

    _validate_chat_request(request)

    _require_completed_video(
        owner_id=owner_id,
        video_id=request.video_id,
    )

    return StreamingResponse(
        stream_agent_response(
            question=request.message,
            video_id=request.video_id,
            owner_id=owner_id,
            thread_id=request.thread_id,
            analysis_mode=request.analysis_mode,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
