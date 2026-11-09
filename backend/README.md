# VideoMind AI — Backend

FastAPI backend for the VideoMind AI multimodal
YouTube research assistant.

## Tech Stack

- Python 3.11
- FastAPI
- Pydantic
- LangChain OpenAI
- LangChain Text Splitters

## Local Setup

Open PowerShell and navigate to the backend folder.

### 1. Create a virtual environment

```powershell
py -3.11 -m venv .venv
```

### 2. Activate the environment

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```powershell
python -m pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file inside `backend/`:

```env
OPENAI_API_KEY=your_openai_api_key
```

The API key is needed for embedding operations.

Never commit `.env` or real API keys.

### 5. Start the API

```powershell
python -m uvicorn app.main:app --reload
```

API: http://127.0.0.1:8000

Swagger: http://127.0.0.1:8000/docs

OpenAPI: http://127.0.0.1:8000/openapi.json

## Development CORS

The following React development origins are allowed:

- http://localhost:5173
- http://localhost:5174
- http://127.0.0.1:5173
- http://127.0.0.1:5174

Production origins will be configured separately.

## API Status — Backend Foundation (PR #2)

### Implemented

| Method | Endpoint | Status |
|--------|----------|--------|
| GET | / | 200 |
| GET | /health | 200 |
| POST | /chat | 200 |

The legacy `/chat` endpoint returns an echo response
for development testing. It is not a RAG endpoint.

### Contracts Only — HTTP 501

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/videos/ingest | Video ingestion |
| GET | /api/v1/videos/{video_id}/status | Ingestion status |
| GET | /api/v1/videos | Video library |
| POST | /api/v1/chat | RAG chat |

These endpoints are defined in the OpenAPI V1 contract
but are not implemented in PR #2.

They intentionally return HTTP 501 Not Implemented.

## Development Roadmap

The following features are developed in subsequent PRs:

- Pinecone vector storage and semantic retrieval
- Transcript ingestion pipeline
- Grounded RAG responses
- LangChain agent and tools
- LangGraph conversation memory
- SSE response streaming

This README describes the standalone backend
foundation in PR #2, not the complete application.

## Deployment Status

Local development only.

Authentication, production CORS, persistent storage,
and deployment configuration are not included in PR #2.
