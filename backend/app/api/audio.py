
"""Authenticated audio transcription endpoint."""

import logging
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool

from app.api.auth import get_current_user_id
from app.api.transcripts import _complete_fallback
from app.schemas.transcript import TranscriptUploadResponse
from app.services.ingestion.audio_transcription import (
    SUPPORTED_FORMATS,
    transcribe_audio_to_srt,
)
from app.services.ingestion.upload import MAX_FILE_SIZE
from app.services.persistence.video_repository import get_video


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/audio",
    tags=["Audio"],
)

CurrentUserId = Annotated[
    str, Depends(get_current_user_id)
]

MAX_AUDIO_UPLOAD = 24_000_000


def _process_audio(
    owner_id: str,
    video_id: str,
    extension: str,
    content: bytes,
) -> int:
    """Transcribe audio and index the resulting SRT."""

    video = get_video(
        owner_id=owner_id,
        video_id=video_id,
    )

    if video is None:
        raise HTTPException(
            status_code=404,
            detail="Video not found.",
        )

    if video["status"] != "failed":
        raise HTTPException(
            status_code=409,
            detail="Audio fallback requires a failed video.",
        )

    with TemporaryDirectory() as folder:
        audio_path = Path(folder) / f"audio{extension}"
        audio_path.write_bytes(content)

        try:
            srt_text = transcribe_audio_to_srt(
                audio_path
            )
        except Exception as exc:
            logger.exception(
                "Audio transcription failed."
            )
            raise HTTPException(
                status_code=502,
                detail="Audio transcription failed.",
            ) from exc

    srt_content = srt_text.encode("utf-8")

    if len(srt_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Generated transcript exceeds 2 MB.",
        )

    return _complete_fallback(
        owner_id=owner_id,
        video_id=video_id,
        filename="audio_transcript.srt",
        content=srt_content,
        transcript_text=srt_text,
        transcript_format="srt",
    )


@router.post(
    "/transcribe",
    response_model=TranscriptUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_audio(
    video_id: Annotated[
        str,
        Form(min_length=1, max_length=128),
    ],
    file: Annotated[UploadFile, File()],
    owner_id: CurrentUserId,
):
    """Transcribe authorized audio for a failed video."""

    extension = Path(file.filename or "").suffix.lower()

    if extension not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format.",
        )

    content = await file.read(MAX_AUDIO_UPLOAD + 1)
    await file.close()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Audio file is empty.",
        )

    if len(content) > MAX_AUDIO_UPLOAD:
        raise HTTPException(
            status_code=413,
            detail="Audio file exceeds 24 MB.",
        )

    chunks_count = await run_in_threadpool(
        _process_audio,
        owner_id,
        video_id,
        extension,
        content,
    )

    return TranscriptUploadResponse(
        video_id=video_id,
        status="completed",
        chunks_count=chunks_count,
    )
