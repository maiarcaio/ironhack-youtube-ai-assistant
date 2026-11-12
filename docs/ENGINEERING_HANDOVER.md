# VideoMind AI — Engineering handover

**Scope:** application, interfaces, service configuration boundaries, testing, security and known limitations. This document is intended to support another engineer taking ownership of the codebase.

## Code layout

| Path | Responsibility |
|---|---|
| `frontend/src/components/` | Authenticated study UI, player, transcript, chat and notes |
| `frontend/src/services/api/` | Supabase browser client and typed API adapters |
| `frontend/e2e*/` | Mock/intercepted browser workflow tests |
| `backend/app/api/` | FastAPI routes, request validation and authentication dependency |
| `backend/app/services/ingestion/` | YouTube caption/audio ingestion and background processing |
| `backend/app/services/agents/` | LangChain/LangGraph agent, six tools, REST and SSE orchestration |
| `backend/app/services/retrieval/` | Pinecone-backed, owner/video-scoped retrieval |
| `backend/app/services/persistence/` | Supabase-backed videos, jobs and conversation history |
| `backend/tests/` | Maintained backend security and API regression tests |
| `supabase/migrations/` | Database tables, RLS and additive library lifecycle schema |
| `evaluation/` | Public evaluation provenance; final detailed evidence pending |
| `deployment/` | Operational deployment and non-destructive checks |

## Architecture and trust boundaries

1. The browser signs in with the Supabase **publishable** key; never bundle privileged credentials.
2. FastAPI verifies the user access token before protected routes, then applies owner/video scoping on reads and writes.
3. Supabase RLS restricts authenticated reads. Privileged backend writes require explicit ownership checks.
4. The ingestion worker processes queued YouTube and authorized media records, caches timed transcripts, and indexes embeddings into Pinecone.
5. The scoped agent retrieves evidence using six tools, saves chat history in Supabase and serves REST or SSE; the frontend presents timestamps with the cited sources.
6. Existing uploaded media uses private storage and time-limited signed playback URLs; the application does not promise automatic access to all YouTube audio.

## Quality evidence and current boundaries

- Team-reported frontend: 163 Vitest, 3 mock Playwright and 15 authenticated/intercepted Playwright cases passed on the final frontend changes.
- Team-reported backend: 60 tests passed after the CORS DELETE correction.
- Production evidence: authenticated library, transcript reading, audio player and seek, an authorized disposable soft-delete returning HTTP 204 with absence after refresh, and backend health/CORS preflight success.
- Previous live Terra/Sol question-answering observations exist; a new model call on the latest production deployment was **not** part of the final browser pass.
- Export All was inspected with eight unique transcript sections and three expected unavailable transcripts belonging to failed records.
- Archive/restore production mutation was not formally exercised during this last acceptance pass.
- LangSmith results are reported but final reproducible V2 artifacts are not yet tracked; see [evaluation/README.md](../evaluation/README.md).
- The top-level `tests/unit/` directory contains older contract assumptions; maintained suite and CI scope are explained in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Operate and release safely

- Frontend: Vercel, `https://videomind-ai-ironhack.vercel.app`.
- Backend: Render, `https://videomind-ai-backend.onrender.com`.
- External dependencies: Supabase Auth/Database/Storage, Pinecone, OpenAI, LangSmith.
- Worker operation depends on the deployed `RUN_INGESTION_WORKER` setting and the API process lifecycle; verify service settings/logs rather than assuming background processing stays active during instance suspension.
- See [deployment/README.md](../deployment/README.md) for configuration, non-mutating smoke checks, rollback and release boundaries.
- Apply reviewed Supabase migrations before deploying backend code that depends on new columns. Never rerun migrations blindly.
- Do not change Render/Vercel settings, run paid evaluations, or modify existing production records without separate authorization.

## Known limitations

- YouTube caption acquisition is sometimes blocked in cloud environments; transcript or authorized audio ingestion is the supported recovery path.
- Browser notes are local to the authenticated user/browser and are not guaranteed to sync across devices.
- Chat history is persisted server-side, but prior threads are not automatically restored in the current frontend after refresh.
- The existing YouTube iframe is cross-origin; browser tests cannot independently read its internal playback clock.
- Historical benchmark results are not representative of production traffic without further evaluation.
