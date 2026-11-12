# VideoMind AI — Deployment and operational runbook

This is a **documentation and verification** boundary for the deployed system. Render, Vercel, Supabase, Pinecone and LangSmith configuration lives in their respective managed accounts; this repository does not yet declare those resources as infrastructure-as-code. Do not mistake this runbook for an automatically applied deployment configuration.

## Environments and ownership

| Service | Production endpoint or role | Source of truth |
|---|---|---|
| Frontend | https://videomind-ai-ironhack.vercel.app | Vercel deployment/alias and Git commit |
| Backend | https://videomind-ai-backend.onrender.com | Render service, process and Git commit |
| Auth, records, private audio | Supabase Auth/PostgreSQL/Storage | Migrations and managed project settings |
| Retrieval | Pinecone | Named index, embedding-model dimensions and namespace/filter contract |
| Models and traces | OpenAI / LangSmith | Backend-only credentials and experiment records |

The frontend owner maintains the Vercel build and public browser environment; the backend owner maintains the Render service, ingestion worker, vector index, database/storage and server secrets. Merge to `main` is not by itself a verified production deployment.

## Frontend (Vercel)

The application is built from `frontend/` using `npm ci` and `npm run build`, with `dist/` as the Vite output. Confirm the project settings in Vercel; do not infer that the repository contains the current account configuration.

Only public browser values belong in Vite:

```dotenv
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://videomind-ai-backend.onrender.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_public_publishable_key
```

**Never** put the Supabase secret/service-role key, bearer tokens, OpenAI/Pinecone keys, upload contents or other credentials into frontend variables or Git.

## Backend (Render)

Configure the service using reviewed values managed in Render. The backend starts as a FastAPI/Uvicorn application (`app.main:app` from `backend/`). Check the actual Render build/start commands and release commit in the dashboard before promoting or rolling back.

Backend-only configuration includes `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` when needed for local helpers, `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, and `LANGSMITH_*` for tracing/evaluation. The exact required variables are described in [backend/README.md](../backend/README.md).

- Set `CORS_ORIGINS` to the exact trusted frontend origin(s); preview origins are distinct from the production alias.
- FastAPI currently allows `GET`, `POST`, `DELETE`, `OPTIONS` with `Authorization` and `Content-Type`. Preflight success does not bypass JWT or ownership checks.
- `RUN_INGESTION_WORKER=true` starts polling inside the API's process. Confirm the process count and whether the service stays awake; instances suspended for inactivity cannot process jobs continuously.
- Store authorized uploaded files privately and issue short-lived signed playback URLs. Monitor worker errors, failed ingest jobs, and storage/pipeline responses; do not weaken private media access to fix a 503.

## Database schema and migration order

Review `supabase/migrations/20261106000000_videomind_core.sql` followed by `20261111000000_library_soft_delete.sql`. The latter adds non-destructive `archived_at` and `deleted_at`. Confirm migrations have actually been applied to the target project **before** the dependent backend release; do not reapply manually or run destructive migrations as part of verification.

Backend service-role writes bypass RLS only after validating the user token and resource ownership. Authenticated frontend reads rely on RLS.

## CI, smoke checks and acceptance

Pull requests run isolated lint/build/unit tests through [CI](../.github/workflows/ci.yml); the pipeline never submits production writes or paid model requests. Local maintained suites and historical test limitations are in [CONTRIBUTING.md](../CONTRIBUTING.md).

After a deployment, perform a read-only probe:

```bash
python3 deployment/verify_public.py
```

The script checks frontend GET, backend `/health`, and browser-style authenticated **DELETE OPTIONS preflight** from the production origin, with a bounded timeout. It submits **no DELETE**, upload or model request and requires no tokens. Pass alternative URLs with `--frontend` / `--backend`; inspect `--help`.

Then, using a test account or specifically authorized fixture, check actual sign-in, owner-scoped library, transcript retrieval, player/seek, and chat REST/SSE if a model call is approved. Record HTTP status, exact deployed SHA/alias, date, video status and error details. Use explicitly approved disposable records for mutations and never delete an existing user's media as a smoke test.

## Failure diagnosis

| Symptom | First checks |
|---|---|
| Browser `Failed to fetch` on DELETE | OPTIONS preflight origin/method/headers; Render CORS; current deployed backend |
| 401 or 403 | Supabase access token and owner-scoping, never service-role key in browser |
| 404 | Owner/video UUID and archived vs soft-deleted state |
| 409 | Video status or lifecycle conflict (queued/processing not removable) |
| 503 on upload/transcript | Private Storage, worker logs, API dependencies and credentials |
| Video remains queued | Worker enabled, Render uptime/logs, jobs table and ingestion attempts |
| Model output lacks citations | Retrieved evidence, selected ready video, tool trace and server log |

## Rollback and change safety

- For a frontend-only regression, review Vercel deployment history and restore a known-good production deployment; verify the alias afterward.
- For backend regression, use Render's release history and confirm compatibility with the currently applied database schema before rolling back.
- Migrations and persistent media are stateful: do not roll them back automatically or physically purge vectors/objects.
- Capture enough provenance to distinguish a deployed commit, an offline test, and a real end-to-end acceptance. Keep credentials and personal transcript data out of reports.

Known results and outstanding qualification are documented in [the engineering handover](../docs/ENGINEERING_HANDOVER.md) and [the dated acceptance report](../docs/FRONTEND_ACCEPTANCE_2026-11-11.md).
