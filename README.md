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

The `main` branch is the integrated application baseline; frontend and backend deploys are managed independently. The code includes authenticated ingestion, transcript recovery, Terra/Sol answers, a standalone Transcripts Library, audio playback, and owner-scoped archive/restore/soft-delete. Production behavior was accepted on selected real records; that acceptance does not prove that every provider or every possible video will succeed.

For operational release checks, use [deployment/README.md](deployment/README.md). For dated evidence and known gaps, use [docs/FRONTEND_ACCEPTANCE_2026-11-11.md](docs/FRONTEND_ACCEPTANCE_2026-11-11.md). Historic release commits remain in Git; do not treat hardcoded commits in dated reports as the current deployment identifier.

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

Pull requests are checked by the repository's [CI workflow](.github/workflows/ci.yml): frontend lint, build and Vitest; backend maintained offline pytest suite. No CI job uses production credentials, live API calls, customer data or billable model requests.

For local verification:

```bash
cd frontend
npm ci
npm run lint
npm run build
npm test
# Optional deterministic browser tests (requires Playwright Chromium)
npm run test:e2e
npm run test:e2e:auth
```

```bash
cd backend
python -m pip install -r requirements-dev.txt -r requirements-supabase.txt -r requirements-youtube.txt
python -m pytest -q tests
```

Browser suites use mock/intercepted services; they do not establish live connectivity. The repository also contains older top-level `tests/unit/` scripts written before current auth/analysis contracts; see [CONTRIBUTING.md](CONTRIBUTING.md) for test scope and debt.

Evaluation code lives under `backend/scripts/`. Its historical six-question experiment is distinct from the team-reported 27-run LangSmith results. Review [evaluation/README.md](evaluation/README.md) before citing quality metrics.

## Deployment

- Frontend production URL: <https://videomind-ai-ironhack.vercel.app>
- Backend production URL: <https://videomind-ai-backend.onrender.com>

Vercel and Render project settings are external configuration and must be confirmed by the project owners. Deployment process and verification guidance are in [`deployment/README.md`](deployment/README.md). Do not present a preprocessed record as a newly ingested one. Keep an approved short audio fixture available as a fallback only when the deployed audio pipeline has been verified.

## Repository structure

```text
frontend/             React UI, API clients and automated browser/unit tests
backend/              FastAPI, worker, model agents, retrieval and backend tests
supabase/migrations/   PostgreSQL schema, ownership policies and library lifecycle
evaluation/           Evaluation provenance and reproducibility requirements
deployment/           Service configuration guidance and non-destructive smoke script
docs/                 Engineering handover and dated acceptance history
.github/workflows/    Automated pull-request validation
tests/unit/           Historical tests requiring API-contract modernization
```

New contributors: [CONTRIBUTING.md](CONTRIBUTING.md). Operational boundaries: [docs/ENGINEERING_HANDOVER.md](docs/ENGINEERING_HANDOVER.md).

## Known limitations

- Automatic YouTube caption acquisition can fail in cloud environments; authorized transcript/audio upload is the supported recovery path.
- The ingestion worker's availability depends on the configured Render service/process lifecycle; it is not guaranteed to operate continuously when infrastructure suspends.
- Server-side chat history persists in Supabase, but the current frontend does not automatically restore previous threads after browser refresh.
- Browser-local notes do not sync across devices.
- The YouTube iframe is cross-origin; browser tests cannot read its internal playback clock.
- RAG quality and cost numbers are dataset-specific; detailed final LangSmith evidence and a methodologically matched baseline have not yet been sanitized and committed.
- Existing failed-status videos may lack transcript data, so bulk export can report partial availability.

## Team responsibilities

Frontend ownership covers React presentation, authentication integration, player lifecycle, transcript interaction, notes, chat streaming presentation, responsive behavior, and browser evidence. Backend ownership covers FastAPI, Supabase server integration and policies, ingestion workers, Whisper, Pinecone, LangChain agents, LangSmith evaluation, Render, and production storage. Coordinate any backend-specific claims with the backend owner.

## Project requirements

The project follows the Ironhack final-project expectations: a multimodal pipeline, agent and vector-database integration, documented architecture and testing, deployment evidence, and evaluation against a baseline. Evaluation must distinguish measured results from planned work and address correctness, hallucination control, retrieval relevance, latency, cost, memory, and future-proofing.
