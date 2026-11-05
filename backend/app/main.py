from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, videos



# Create the FastAPI application
app = FastAPI(
    title="VideoMind AI API",
    description="Backend API for the multimodal YouTube RAG assistant.",
    version="0.1.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


app.include_router(chat.router)
app.include_router(videos.router)

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
