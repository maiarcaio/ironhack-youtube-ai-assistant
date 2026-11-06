from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.chat import (
    ChatRequest,
    ChatV1Request,
    ChatV1Response,
)

from app.services.agents.chat_service import answer_with_agent


from fastapi.responses import StreamingResponse

from app.services.agents.stream_service import stream_agent_response


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

    result = answer_with_agent(
    question=request.message,
    video_id=request.video_id,
    owner_id="local-dev",
    thread_id=request.thread_id,
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
def chat_stream(request: ChatV1Request, http_request: Request):
    """
    Stream agent responses using Server-Sent Events.

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

    if not request.message.strip() or len(request.message) > 500:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question must contain 1-500 characters.",
        )

    return StreamingResponse(
        stream_agent_response(
            question=request.message,
            video_id=request.video_id,
            owner_id="local-dev",
            thread_id=request.thread_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
