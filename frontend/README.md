# VideoMind AI Frontend

React and TypeScript interface for VideoMind AI. The frontend authenticates users with Supabase, sends authenticated video and transcript requests to the FastAPI backend, polls backend-owned processing status, and streams grounded Q&A answers with timestamp citations.

The browser does not acquire YouTube captions, download audio, run Whisper, create embeddings, or write to Pinecone. Those operations belong to the deployed backend.

## Requirements

- Node.js 22 LTS (Vite 8 requires a current Node release)
- npm
- Chromium installed through Playwright for browser tests

Install dependencies and the managed browser:

```bash
npm install
npx playwright install chromium
```

## Environment

Copy the safe template and supply public frontend configuration:

```bash
cp .env.example .env.local
```

Required variables:

```dotenv
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

Only public Supabase browser configuration belongs in Vite variables. Never put a Supabase service-role key, backend secret, Pinecone key, or model-provider credential in this directory.

### Real-backend mode

Set `VITE_USE_MOCK_API=false` and configure all three backend/Supabase values. The application requires a valid Supabase session and sends its bearer token to FastAPI.

### Explicit mock mode

Set `VITE_USE_MOCK_API=true` for the local demonstration adapter. Mock mode is simulated, does not authenticate, and does not claim real transcript indexing, RAG answers, or citations. Missing configuration never silently enables mock mode.

## Development and validation

```bash
npm run dev
npm run build
npm run lint
npm test -- --run
npm run test:e2e
npm run test:e2e:auth
```

- `npm run test:e2e` runs the explicit mock-mode browser suite.
- `npm run test:e2e:auth` intercepts Supabase and FastAPI traffic for deterministic authenticated workflow coverage.
- Browser tests are offline simulations; they do not prove connectivity to live Supabase, Render, Pinecone, YouTube playback, Whisper, or a model provider.

## Frontend integration map

- `src/components/auth/AuthGate.tsx`: Supabase session restoration and sign-in.
- `src/services/api/authenticatedVideoApi.ts`: authenticated library, ingestion, and status requests.
- `src/App.tsx`: UUID-backed library state, status polling, failed-video recovery, and readiness transitions.
- `src/services/api/videomindBackend.ts`: authenticated transcript upload and SSE chat transport.
- `src/components/workspace/TranscriptUploadPanel.tsx`: last-resort TXT/SRT/VTT recovery after backend-confirmed failure.
- `src/components/chat/ChatPanel.tsx`: conversation state, SSE rendering, citations, and thread IDs.

The backend status `completed` is normalized to the frontend state `ready`. Chat unlocks only after a status response confirms completion; an HTTP 201 transcript-upload response alone does not unlock it.

## Backend dependencies and current limitations

Real operation depends on Diogo's deployed FastAPI service and its configured Supabase verification, YouTube caption/audio acquisition, Whisper fallback, embeddings, Pinecone index, and LangChain chat pipeline.

- Manual transcript upload appears only after automatic processing reports `failed`.
- TXT, SRT, and VTT files are accepted up to 2 MB.
- VideoMind retrieves stored transcripts directly from Supabase using authenticated, owner-scoped access. The backend still does not expose a separate transcript-read or chapter endpoint.
- Live CORS, Supabase tokens, Render availability, YouTube embed policy, processing providers, and citation quality require staging validation with the deployed backend.
