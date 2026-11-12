# VideoMind AI

VideoMind AI is an authenticated study workspace for turning YouTube videos and authorized audio recordings into searchable, source-grounded knowledge. It is designed for learners, researchers, and teams who need to ask questions, inspect transcript evidence, and return to the exact moment that supports an answer.

## What is implemented

- Supabase authentication and owner-scoped video library access.
- YouTube URL ingestion with backend-owned UUIDs and queued/processing/ready/failed status handling.
- Authorized MP3, WAV, and M4A upload through the authenticated frontend.
- YouTube and signed HTML5 audio playback in the shared workspace.
- Complete stored transcript retrieval, SRT/VTT/TXT parsing, search, highlighting, and timestamp navigation.
- Terra (quick answers) and Sol (deep analysis) modes using the existing authenticated chat API and SSE stream.
- Source evidence cards with transcript timestamps.
- Browser-local, authenticated-user-isolated saved notes with playback timestamps.
- Responsive library, workspace, transcript, Q&A, and notes interfaces.

Mock mode is intentionally separate from authenticated mode. Mock data and answers are not evidence of production connectivity.

## Release status

The production domain and `main` branch are the authoritative released baseline. PR #16 (authenticated audio upload/player), PR #17 (unified workspace/navigation and transcript lifecycle correction) and PR #24 (library management) are merged into `main`; PR #18 remains the documentation review. Production acceptance should still be verified against the deployed commit and backend availability.

## Architecture

```text
React + TypeScript + Vite
  ├─ Supabase browser client (session and publishable-key auth)
  └─ authenticated HTTP/SSE requests
        ↓
FastAPI backend
  ├─ owner-scoped video and transcript records in Supabase/PostgreSQL
  ├─ ingestion worker and Whisper audio transcription
  ├─ OpenAI embeddings → Pinecone retrieval
  └─ LangChain/LangGraph agent → JSON or SSE grounded answers
        ↓
  Supabase / Pinecone / model provider / LangSmith tracing
```

The frontend never uses backend service keys. The backend verifies the Supabase bearer token and applies ownership checks before protected reads or writes. Supabase RLS protects authenticated reads. Confirm backend deployment details with the backend owner before presenting them as production guarantees.

## Local development

```bash
cd frontend
npm install
npx playwright install chromium
cp .env.example .env.local
npm run dev -- --host localhost --port 5175
```

Configure only public frontend values in `frontend/.env.local`:

```dotenv
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

For a deterministic demonstration, set `VITE_USE_MOCK_API=true`. This mode does not authenticate and must not be described as a live RAG test. Never place service-role keys, model keys, Pinecone keys, or bearer tokens in the frontend environment.

The backend setup and protected API contract are documented in [`backend/README.md`](backend/README.md). The frontend currently retrieves stored transcripts directly through authenticated Supabase access; the backend does not expose a separate transcript-read or chapter endpoint.

## Validation

From `frontend/`:

```bash
npm run build
npm run lint
npm test -- --run
npm run test:e2e
npm run test:e2e:auth
```

The mock and intercepted browser suites are offline simulations. They validate UI and adapters, not Render, Supabase Storage, Whisper, Pinecone, model latency, or real YouTube playback. Real acceptance results are recorded separately in [`docs/FRONTEND_ACCEPTANCE_2026-11-11.md`](docs/FRONTEND_ACCEPTANCE_2026-11-11.md).

## Deployment

- Frontend production URL: <https://videomind-ai-ironhack.vercel.app>
- Backend production URL: <https://videomind-ai-backend.onrender.com>

Vercel and Render project settings are external configuration and must be confirmed by the project owners. Deployment process and verification guidance are in [`deployment/README.md`](deployment/README.md). Do not present a preprocessed record as a newly ingested one. Keep an approved short audio fixture available as a fallback only when the deployed audio pipeline has been verified.

## Repository structure

```text
frontend/       React application, Supabase client, API adapters, players, notes, and browser tests
backend/        FastAPI service, ingestion/audio workers, agent tools, and backend tests
supabase/       Database migrations and security policies
evaluation/     Evaluation assets and project placeholders
docs/           Acceptance and project documentation
```

## Known limitations

- Production audio acceptance depends on Supabase Storage, Whisper processing, worker availability, indexing, signed playback, and backend CORS.
- Automatic YouTube caption acquisition can fail in cloud environments; the documented recovery path is an authorized transcript or audio upload.
- Chat history is persisted by the backend, but this frontend does not restore prior conversations after a browser refresh.
- The YouTube iframe is cross-origin, so automated local checks can verify timestamp dispatch and player continuity but cannot independently read the iframe's playback clock.
- Citation quality, latency, cost, memory usage, and accuracy require the backend evaluation artifacts and a larger measured dataset; no unverified performance numbers are claimed here.

## Team responsibilities

Frontend ownership covers React presentation, authentication integration, player lifecycle, transcript interaction, notes, chat streaming presentation, responsive behavior, and browser evidence. Backend ownership covers FastAPI, Supabase server integration and policies, ingestion workers, Whisper, Pinecone, LangChain agents, LangSmith evaluation, Render, and production storage. Coordinate any backend-specific claims with the backend owner.

## Project requirements

The project follows the Ironhack final-project expectations: a multimodal pipeline, agent and vector-database integration, documented architecture and testing, deployment evidence, and evaluation against a baseline. Evaluation must distinguish measured results from planned work and address correctness, hallucination control, retrieval relevance, latency, cost, memory, and future-proofing.
