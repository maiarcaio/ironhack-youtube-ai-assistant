# VideoMind AI Frontend Deployment

This document describes the frontend deployment boundary. It does not apply Render settings or contain backend credentials.

The production deployment tracks `main`. PR #16, PR #17 and PR #24 are merged. As of November 12, 2026, Vercel reports production deployment `5n1LAYQLa9GpwMBQHXkHPtxYHsrK` Ready at `https://videomind-ai-ironhack.vercel.app`, serving `main` commit `b7ef04802cad674370e7a792e60e61e563b9edc2`. Re-check Vercel and backend availability before treating this as complete live acceptance evidence.

## Architecture

- Frontend: Vercel project `ironhack-youtube-ai-assistant`, built from `frontend/`.
- Production frontend domain: `https://videomind-ai-ironhack.vercel.app`.
- Backend origin: `https://videomind-ai-backend.onrender.com`.
- Authentication: Supabase browser client using the public project URL and publishable key.

## Vercel configuration

Configure these variables in the Vercel project for Preview and Production as appropriate:

```text
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://videomind-ai-backend.onrender.com
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<public-key>
```

Only the publishable Supabase key belongs in the browser bundle. Never configure service-role keys, backend secrets, Pinecone keys, model-provider keys, or bearer tokens as Vite variables.

## Preview versus production

Pull requests receive Vercel preview deployments. A preview origin is different from `videomind-ai-ironhack.vercel.app`; the exact preview origin must be included in the backend CORS allowlist before authenticated API or audio tests can pass.

Production deployment follows the Vercel project’s configured production branch. This repository does not contain a deployment script that changes Vercel settings, and no deployment should be promoted manually from this document.

## Verification checklist

1. Open the exact deployment URL and confirm the build identifies itself as VideoMind AI.
2. Confirm `VITE_USE_MOCK_API=false` behavior by checking for the authenticated sign-in screen and Backend mode after login.
3. Sign in through the normal UI without recording credentials.
4. Load the owner-scoped library and confirm real records come from the configured backend.
5. Test a ready YouTube transcript, one citation timestamp, and notes before testing audio.
6. Run a read-only `OPTIONS` check for `/api/v1/videos/upload` from the exact deployment origin.
7. Only with an authorized fixture, test the full audio workflow once; stop on storage, worker, or CORS failure.
8. Confirm browser console errors are application errors, not unrelated extensions.

## CORS and ownership

The frontend owner controls Vercel environment variables and deployment configuration. The backend owner controls the Render CORS allowlist and backend availability. Every preview origin, the production frontend origin, and authorized local development origins must be coordinated with the backend before live API testing.

## Rollback and limitations

Use Vercel’s existing deployment history to select a prior known-good frontend deployment if a frontend release must be rolled back. Do not change Render or Supabase settings as part of a frontend rollback.

Audio acceptance remains dependent on backend storage, Whisper processing, workers, indexing, signed playback, and backend CORS. A successful Vercel build or OPTIONS preflight is not proof that the full audio pipeline works.
