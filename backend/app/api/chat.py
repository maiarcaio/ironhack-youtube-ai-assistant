
from fastapi import APIRouter, HTTPException, status

from app.schemas.chat import ChatRequest, ChatV1Request, ChatV1Response


router = APIRouter(tags=["Chat"])


@router.post("/chat")
def chat(request: ChatRequest):
    """
    Legacy chat endpoint for testing.
    """
    return {
        "reply": f"You asked: {request.message}"
    }


@router.post(
    "/api/v1/chat",
    response_model=ChatV1Response,
    responses={501: {"description": "RAG chat not implemented yet"}}
)
def chat_v1(request: ChatV1Request):
    """
    Answer questions using the selected video's evidence.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="RAG chat is not implemented yet."
    )
