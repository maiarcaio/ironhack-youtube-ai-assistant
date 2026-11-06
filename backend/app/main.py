
"""VideoMind AI FastAPI application."""

import asyncio
import logging
import os

from contextlib import asynccontextmanager, suppress
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, transcripts, videos
from app.services.ingestion.worker import process_next_job


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logger = logging.getLogger("videomind.worker")


async def run_ingestion_loop() -> None:
    """Process queued video jobs while the API is running."""

    logger.info("VideoMind ingestion worker started.")

    while True:
        try:
            result = await asyncio.to_thread(process_next_job)

            if result is not None:
                logger.info(
                    "Video %s: %s",
                    result["video_id"],
                    result["status"],
                )

        except Exception:
            logger.exception("Ingestion worker cycle failed.")

        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage the optional background worker lifecycle."""

    worker_task = None

    enabled = (
        os.getenv("RUN_INGESTION_WORKER", "false").lower()
        == "true"
    )

    if enabled:
        worker_task = asyncio.create_task(
            run_ingestion_loop()
        )

    yield

    if worker_task is not None:
        worker_task.cancel()

        with suppress(asyncio.CancelledError):
            await worker_task


app = FastAPI(
    title="VideoMind AI API",
    description="Backend API for the YouTube RAG assistant.",
    version="0.1.0",
    lifespan=lifespan,
)

cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(chat.router)
app.include_router(videos.router)
app.include_router(transcripts.router)


@app.get("/")
def read_root():
    return {"message": "VideoMind AI API is running!"}


@app.get("/health")
def health_check():
    return {"status": "ok"}
