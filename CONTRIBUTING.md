# Engineering contribution guide

VideoMind AI is a multi-service application. Changes should be reviewable, reproducible and safe for user data.

## Scope and ownership

- `frontend/`: React/TypeScript UI, Supabase browser auth, player, transcript reader and browser tests.
- `backend/`: FastAPI, authenticated endpoints, ingestion worker, agents, retrieval and backend tests.
- `supabase/migrations/`: additive schema/RLS migrations, coordinated with backend releases.
- `evaluation/`: methodology and sanitized reproducible evaluation artifacts.
- `deployment/`: operations guidance and non-destructive deployment checks.

Keep frontend and backend changes separate when possible. A production behavior change should describe the cross-service contract in the PR.

## Local quality gates

Frontend (Node.js 22):
```bash
cd frontend
npm ci
npm run lint
npm run build
npm test
```

Backend (Python 3.11):
```bash
cd backend
python -m pip install -r requirements-dev.txt -r requirements-supabase.txt -r requirements-youtube.txt
python -m pytest -q tests
```

The browser suites are separate and require Chromium:
```bash
cd frontend
npx playwright install chromium
npm run test:e2e
npm run test:e2e:auth
```

The E2E browser suites use mock or intercepted requests. They do **not** substitute for authorized live acceptance.

**Historical test debt:** the repository also contains `tests/unit/` outside `backend/`. Some of these older tests were written against a pre-authentication and pre-Sol API; reconcile their fixtures/contracts before using them in a whole-repository test claim. The current CI initially gates the maintained `backend/tests/` suite.

## Pull-request review checklist

1. Describe the behavior, files touched and why the change is needed.
2. Confirm that no credentials, bearer tokens, customer media, private transcripts, or production datasets are committed.
3. Run affected lint, build and tests; record exact commands/results or explain a blocker.
4. Cover ownership, error handling, race conditions and data lifecycle for API changes.
5. For schema changes, include reversible migration and deployment ordering.
6. For AI changes, report reference datasets and evaluation method; never treat judge scores as universal accuracy.
7. Keep PRs focused. Require another engineer's review for backend/database changes and deployment-impacting changes.
8. Do not run destructive or billable end-to-end tests without explicit authorization.

## Release discipline

Merge to `main` after review and passing checks. Verify deployment against the exact commit; a successful Vercel status is not proof that Render and the model pipeline were also updated. Perform read-only health/preflight checks first and use expressly approved disposable records for any write/mutation acceptance. Document rollback and unresolved limitations; do not silently rewrite historical test results.

See [the operations guide](deployment/README.md), [the backend guide](backend/README.md), and [evaluation provenance](evaluation/README.md).
