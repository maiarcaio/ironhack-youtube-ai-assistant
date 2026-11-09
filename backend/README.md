# VideoMind AI — Backend

FastAPI backend for **VideoMind AI**, an AI-powered YouTube video research assistant. It combines transcript ingestion, semantic retrieval, LangChain agents, conversational memory, and streamed answers grounded in video content.

The React frontend is maintained separately within the same project.

## Tech Stack

- **Python 3.11**, FastAPI, Pydantic, Uvicorn
- **LangChain / LangGraph** and OpenAI models for agent-based question answering
- **OpenAI embeddings** and **Pinecone** for vector search
- **Supabase Auth + PostgreSQL** for user authentication, video records, ingestion jobs, transcripts, and conversation history
- **OpenAI Whisper** for speech-to-text transcription of supplied audio files
- **LangSmith** for tracing and RAG evaluation
- **Server-Sent Events (SSE)** for streamed chat responses

## Main Capabilities

- Register YouTube videos by URL and track ingestion status: `queued`, `processing`, `completed`, or `failed`.
- Attempt to retrieve YouTube captions, split transcript text into chunks, embed it, and index it in Pinecone.
- Recover a failed ingestion by uploading an authorized UTF-8 `.txt`, `.srt`, or `.vtt` transcript (maximum **2 MB**).
- Transcribe supported audio files using Whisper and use the resulting SRT as a fallback for a failed video.
- Ask questions about a completed video through a scoped LangChain agent with multiple transcript/metadata tools.
- Receive grounded answers with source excerpts and chunk identifiers.
- Stream answers with SSE events: `meta`, `token`, `sources`, `done`, and `error`.
- Persist chat threads and user/assistant messages in Supabase so conversation history survives server restarts.
- Trace the application with LangSmith and evaluate answers for correctness, groundedness, and retrieval relevance.

**Current limitation:** automatic YouTube caption extraction may return HTTP 403 from cloud-hosted environments such as Render. When that happens, the supported recovery path is a transcript upload or an authorized audio upload. The application does **not** claim to download arbitrary YouTube audio automatically.

## Local Setup (Windows PowerShell)

Run commands from the `backend/` directory.

### 1. Create and activate the virtual environment

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

```powershell
python -m pip install -r requirements-supabase.txt
python -m pip install -r requirements-youtube.txt
```

Both files include the base `requirements.txt`. The first adds the Supabase client; the second adds `youtube-transcript-api`.

### 3. Configure environment variables

Create `backend/.env` using the following names (replace placeholders locally):

```dotenv
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=videomind-rag
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your_backend_only_secret_key
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_PROJECT=videomind-ai
CORS_ORIGINS=http://localhost:5173,http://localhost:5177
RUN_INGESTION_WORKER=true
```

- `SUPABASE_SECRET_KEY` is **backend-only**. Never place it in React environment variables or client-side bundles.
- The publishable key is intended for client-side authentication and is also used by an optional local token helper.
- `LANGSMITH_*` variables are needed for tracing/evaluation, not for basic API startup.
- `RUN_INGESTION_WORKER=true` runs the ingestion polling loop in the API process while that process is active.
- Keep `.env` out of Git; never commit keys or bearer tokens.

### 4. Prepare external services

- Create a Supabase project and apply the schema in `../supabase/migrations/20261106000000_videomind_core.sql` if it has not already been applied. Do not apply the same migration twice.
- Configure a Pinecone index compatible with the configured embedding model (the tested index uses **1,536-dimensional vectors**).
- Create a Supabase Auth test user. Protected endpoints require a valid **user access token (JWT)**, not a publishable key or service key.

### 5. Start the API

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

- API: http://127.0.0.1:8000
- Health: http://127.0.0.1:8000/health
- Swagger: http://127.0.0.1:8000/docs
- OpenAPI: http://127.0.0.1:8000/openapi.json

In Swagger, click **Authorize** and enter the Supabase user access token for protected routes.

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | API status message |
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/videos/ingest` | Queue a YouTube video; returns a backend-generated UUID |
| `GET` | `/api/v1/videos` | List the authenticated user's videos |
| `GET` | `/api/v1/videos/{video_id}/status` | Check video processing status |
| `POST` | `/api/v1/transcripts/upload` | Upload TXT/SRT/VTT fallback for a failed video |
| `POST` | `/api/v1/audio/transcribe` | Upload audio for Whisper transcription and fallback ingestion |
| `POST` | `/api/v1/chat` | Grounded agent-based QA for a completed video |
| `POST` | `/api/v1/chat/stream` | Stream an agent answer via SSE |
| `POST` | `/chat` | Legacy authenticated echo endpoint; **not** RAG |

All `/api/v1/` routes above require authentication. The audio route is part of the **local backend changes** and must be deployed before it is available on the public Render API.

### Example: Register a video

`POST /api/v1/videos/ingest`

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

The response contains `video_id` and `status: "queued"`. Poll the status endpoint until processing completes or fails.

### Example: Transcript fallback

`POST /api/v1/transcripts/upload`, multipart form data:

- `video_id`: UUID returned by the ingestion endpoint
- `file`: a UTF-8 `.txt`, `.srt`, or `.vtt` file (up to 2 MB)

This endpoint is intended for a video in the `failed` state. On success, it stores transcript text in Supabase, indexes chunks in Pinecone, and marks the video and job `completed`.

### Example: Chat

`POST /api/v1/chat`

```json
{
  "video_id": "YOUR_VIDEO_UUID",
  "message": "What are the main ideas discussed in the video?",
  "thread_id": null,
  "analysis_mode": "auto"
}
```

Pass the returned `thread_id` on subsequent requests to continue the same conversation. The chat response includes `answer`, `sources`, `insufficient_evidence`, and `model_used`.

The streaming endpoint accepts the same request body and sends SSE events. The frontend should concatenate successive `token.text` fragments and use `sources` / `done` to finalize the response.

## Architecture and Data Flow

```text
React client (Supabase login)
    -> FastAPI (JWT verification and video ownership checks)
    -> Supabase (videos, ingestion_jobs, transcripts, chat history)
    -> Ingestion worker / transcript or audio fallback
    -> OpenAI embeddings + Pinecone indexing
    -> LangChain agent + Pinecone retrieval
    -> OpenAI answer generation
    -> JSON response or SSE stream
    -> LangSmith tracing / offline evaluation
```

Supabase Row Level Security (RLS) protects authenticated reads. Backend writes use a privileged Supabase client **only after request authentication and ownership checks**.

## Evaluation and Testing

The RAG evaluation scripts are in `backend/scripts/`:

- `create_evaluation_dataset.py` — creates the LangSmith dataset from `evaluation_questions.json`.
- `rag_evaluators.py` — computes LLM-judged correctness, groundedness, and retrieval relevance.
- `run_rag_evaluation.py` — runs the dataset against the local agent and uploads evaluation results to LangSmith.

The evaluation asset folder is expected beside the repository, at `../videomind-test-assets/` relative to the repository root (for example, `ironhackdf/videomind-test-assets/`). The assets are separate from source code and must be obtained with appropriate rights.

From `backend/`:

```powershell
python scripts/create_evaluation_dataset.py
python scripts/run_rag_evaluation.py
```

**API costs:** dataset creation itself does not invoke an OpenAI model, but running the RAG evaluation invokes the agent and an OpenAI-based judge. Avoid rerunning evaluations unnecessarily.

**Validated locally (6 November 2026):**

- Transcript fallback: **16 chunks** reported for an Open University educational video; video/job and cached transcript confirmed in Supabase.
- RAG question answering and Pinecone source retrieval: successful.
- SSE streaming: `meta`, multiple `token` messages, `sources`, and `done` confirmed.
- Persistent Supabase conversation history: a two-turn conversation was stored and retrieved (one thread, four messages).
- LangSmith evaluation: **6 questions, 6/6 passing scores** in each of the three metrics, according to the recorded evaluator feedback. This is a small dataset result, not a general accuracy guarantee.
- Whisper speech-to-text service: an English MP3 was transcribed to timestamped SRT successfully.

**Still to validate:** the complete audio-upload API flow, all newly added agent tools together, and the integrated frontend-to-backend workflow.

## Deployment and Collaboration

- Public API: https://videomind-ai-backend.onrender.com
- The Render deployment currently provides the previously published backend. **New local changes** (expanded agent tools, Supabase-backed chat memory, Whisper audio endpoint, and LangSmith evaluation scripts) must be reviewed, committed, integrated, and deployed separately.
- Configure `CORS_ORIGINS` on Render to include the React development origin (currently `http://localhost:5177`).
- Render Free instances can suspend when idle; the in-process worker does not run continuously while the service is asleep.
- The React frontend is being integrated by a teammate. Coordinate the backend release with frontend testing rather than deploying unreviewed local changes.

## Security and Licensing Notes

- Never commit `.env`, private Supabase keys, API tokens, or uploaded personal content.
- Only ingest videos, transcripts, and audio that you are authorized to access and process.
- Keep user/video scoping on retrieval and memory operations.
- Citation chunk IDs identify retrieved transcript excerpts; plain TXT inputs do not provide timestamps, so time offsets may be `null`.
