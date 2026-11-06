
"""VideoMind AI FastAPI application."""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, transcripts, videos


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(
    title="VideoMind AI API",
    description="Backend API for the YouTube RAG assistant.",
    version="0.1.0",
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
