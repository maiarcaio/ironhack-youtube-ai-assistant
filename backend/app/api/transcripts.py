
from typing import Annotated

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool

from app.schemas.transcript import TranscriptUploadResponse
from app.services.ingestion.upload import (
    MAX_FILE_SIZE,
    ingest_uploaded_transcript,
)


router = APIRouter(
    prefix="/api/v1/transcripts",
    tags=["Transcripts"],
)


@router.post(
    "/upload",
    response_model=TranscriptUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_transcript(
    request: Request,
    video_id: Annotated[str, Form(min_length=1, max_length=128)],
    file: Annotated[UploadFile, File()],
):
    """
    Upload and index a TXT, SRT or VTT transcript.

    Local development only until authentication is implemented.
    """

    client_host = (
        request.client.host if request.client else None
    )

    if client_host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not implemented. Local testing only.",
        )

    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Uploaded file exceeds the 2 MB limit.",
        )

    try:
        chunks_count = await run_in_threadpool(
            ingest_uploaded_transcript,
            filename=file.filename or "",
            content=content,
            video_id=video_id,
            owner_id="local-dev",
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return TranscriptUploadResponse(
        video_id=video_id,
        status="completed",
        chunks_count=chunks_count,
    )
