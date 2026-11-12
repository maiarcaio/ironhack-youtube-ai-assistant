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

## Local development

Run commands from `backend/`. Use **Python 3.11** and an isolated virtual environment.

macOS/Linux:
```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt -r requirements-supabase.txt -r requirements-youtube.txt
```

Windows PowerShell:
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt -r requirements-supabase.txt -r requirements-youtube.txt
```

Create `backend/.env` locally; never commit it:

```dotenv
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=videomind-rag
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your_backend_only_secret_key
SUPABASE_PUBLISHABLE_KEY=your_public_publishable_key
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_PROJECT=videomind-ai
CORS_ORIGINS=http://localhost:5173
RUN_INGESTION_WORKER=true
```

- `SUPABASE_SECRET_KEY` is **backend-only**; only the public publishable key belongs in the browser.
- Apply the reviewed Supabase migrations from `../supabase/migrations/` in order **before** deploying code that depends on new columns. Confirm migration state rather than blindly reapplying SQL.
- Configure a Pinecone index compatible with the embedding model (the tested index used 1,536 dimensions). Supply a real Supabase Auth user access token for authenticated API calls.
- `RUN_INGESTION_WORKER=true` runs the polling worker inside the FastAPI process. Do not separately launch a second worker against the same queue without first reviewing operational ownership.

Start the API:
```bash
python -m uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for Swagger, `/openapi.json` for the live schema, and `/health` for a read-only health check. Most `/api/v1/` endpoints require a valid Supabase bearer token.

Offline tests:
```bash
python -m pytest -q tests
```

This is the maintained backend test suite. Older top-level `../tests/unit/` files require adaptation to the current authentication and Terra/Sol contracts before inclusion in a combined test claim.

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/`, `/health` | Public status and health |
| POST | `/api/v1/videos/ingest` | Queue an authorized YouTube URL |
| POST | `/api/v1/videos/upload` | Queue an authorized media upload |
| GET | `/api/v1/videos` | Active videos owned by the user |
| GET | `/api/v1/videos?archived=true` | Archived owned videos |
| GET | `/api/v1/videos/{video_id}/status` | Ingestion status |
| GET | `/api/v1/videos/{video_id}/playback` | Time-limited signed playback for private media |
| GET | `/api/v1/videos/{video_id}/moments` | Timed transcript moments |
| POST | `/api/v1/videos/{video_id}/archive` | Archive without deleting underlying data |
| POST | `/api/v1/videos/{video_id}/restore` | Restore an archived video |
| DELETE | `/api/v1/videos/{video_id}` | Owner-scoped logical deletion; HTTP 204 on success |
| POST | `/api/v1/transcripts/upload` | TXT/SRT/VTT fallback for a failed video |
| POST | `/api/v1/audio/transcribe` | Whisper audio fallback for a failed video |
| POST | `/api/v1/chat` | Grounded REST QA |
| POST | `/api/v1/chat/stream` | Grounded SSE QA |
| POST | `/chat` | Legacy authenticated echo; not RAG |

Protected routes verify the Supabase user JWT and enforce owner/video scope. The frontend reads stored transcripts directly through authenticated Supabase RLS; there is no separate backend transcript-read endpoint. Soft-delete does **not** physically erase Pinecone vectors, stored audio, or related database rows.

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

## Evaluation and testing

**Automated local/backend tests** are in `backend/tests/`; run `python -m pytest -q tests` from this directory. Tests use mocked services and do not establish live model quality, storage availability, or real account isolation without separate acceptance.

The LangSmith evaluation scripts are:
- `scripts/create_evaluation_dataset.py`
- `scripts/run_rag_evaluation.py`
- `scripts/rag_evaluators.py`

The first two are bound to a **historical six-question** Open University dataset from a separate, licensed asset directory, `../videomind-test-assets/`, and to a configured backend video record. They **do not** reproduce the later team-reported 27-run experiment. The evaluation invokes an agent and LLM judge and incurs external costs.

See [evaluation/README.md](../evaluation/README.md) for the six-question baseline, V2 reported results, and precise missing reproducibility artifacts. LLM-judged 1.00 scores on a small dataset are not guarantees of universal accuracy.

Live integration helpers in `scripts/check_*_e2e.py` and ingestion scripts may access real external services and/or mutate test data. Review each script, verify authorization and use disposable fixtures before execution.

The authenticated client and browser acceptance history is recorded in [docs/FRONTEND_ACCEPTANCE_2026-11-11.md](../docs/FRONTEND_ACCEPTANCE_2026-11-11.md).

## Deployment and operations

- Public backend: https://videomind-ai-backend.onrender.com
- Public frontend: https://videomind-ai-ironhack.vercel.app
- Render supplies the backend process and its environment. Vercel builds the frontend from `frontend/`; Supabase and Pinecone are external managed services.
- Configure production `CORS_ORIGINS` with the **exact** deployed frontend origin. The backend permits GET, POST, DELETE and OPTIONS, with Authorization/Content-Type request headers.
- The ingestion worker is controlled by `RUN_INGESTION_WORKER`; verify Render process count, service settings and worker logs before assuming continuous operation. A sleeping/free instance does not process background jobs while suspended.
- Deployment is controlled through the authorized external accounts; committing to GitHub alone does not prove a new Render instance is serving the merged code.
- Start with read-only health and CORS checks; use [deployment/verify_public.py](../deployment/verify_public.py) for a bounded, credential-free probe. Only test writes with approved disposable data.
- Coordinate migrations and signed storage configuration with the backend owner; no deploy script here changes those services automatically.

Full process, rollback and account boundaries: [deployment/README.md](../deployment/README.md).

## Security and Licensing Notes

- Never commit `.env`, private Supabase keys, API tokens, or uploaded personal content.
- Only ingest videos, transcripts, and audio that you are authorized to access and process.
- Keep user/video scoping on retrieval and memory operations.
- Citation chunk IDs identify retrieved transcript excerpts; plain TXT inputs do not provide timestamps, so time offsets may be `null`.
