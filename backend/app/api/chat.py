from uuid import uuid4
from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.chat import (
    ChatRequest,
    ChatV1Request,
    ChatV1Response,
)

from app.services.retrieval.rag import answer_from_video


router = APIRouter(tags=["Chat"])


@router.post("/chat")
def chat(request: ChatRequest):
    """Legacy endpoint for testing."""
    return {
        "reply": f"You asked: {request.message}"
    }


@router.post(
    "/api/v1/chat",
    response_model=ChatV1Response,
)
def chat_v1(request: ChatV1Request, http_request: Request):
    """
    Answer questions using evidence from the selected video.

    Local development only until authentication is implemented.
    """

    client_host = (
        http_request.client.host
        if http_request.client
        else None
    )

    if client_host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not implemented. Local testing only.",
        )

    if request.analysis_mode != "auto":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Deep Analysis is not implemented yet.",
        )

    if request.response_language is not None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Explicit response language is not implemented yet.",
        )

    result = answer_from_video(
        question=request.message,
        video_id=request.video_id,
        owner_id="local-dev",
    )

    return ChatV1Response(
        video_id=request.video_id,
        thread_id=request.thread_id or str(uuid4()),
        answer=result["answer"],
        sources=result["sources"],
        insufficient_evidence=result["insufficient_evidence"],
        model_used=result["model_used"],
    )
