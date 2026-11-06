from fastapi import FastAPI
from app.api import chat, videos, transcripts



# Create the FastAPI application
app = FastAPI(
    title="VideoMind AI API",
    description="Backend API for the multimodal YouTube RAG assistant.",
    version="0.1.0"
)

app.include_router(chat.router)
app.include_router(videos.router)
app.include_router(transcripts.router)

# Root endpoint
@app.get("/")
def read_root():
    return {
        "message": "VideoMind AI API is running!"
    }


# Health check endpoint
@app.get("/health")
def health_check():
    return {
        "status": "ok"
    }
