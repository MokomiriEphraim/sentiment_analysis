# AGENTS.md

## Project overview

Full-stack sentiment analysis app ("Cloud Sentiment"):
- **Frontend**: React 19 + Vite 8 + Tailwind 4 (`src/`, `index.html`)
- **Backend**: single-file Express app (`server.ts`, ~1470 lines) — API, sidecar proxy, scraping, email, Mongo
- **Python sidecar**: FastAPI VADER service (`python/main.py` + `python/causal_engine.py`), port 8000

Express proxies `/api/py-*` → Python sidecar. The frontend only calls relative `/api/...` paths.

## Commands

- `npm run dev` — Express + Vite middleware dev server (port 3000). This is the only dev server; do not run `vite` directly.
- `npm run sidecar` — Python VADER sidecar (port 8000). Runs from repo-root `.venv` (`cd python && ../.venv/bin/uvicorn ...`). Start this alongside `dev` for full NLP features.
- `npm run lint` — `tsc --noEmit`. This is the only check (no ESLint, Prettier, or test suite exists). Run it before considering work done.
- `npm run build` — `vite build` → `dist/` (required before `npm start` in production mode).
- `npm start` — production: `tsx server.ts` (needs `dist/` + `NODE_ENV=production`).

No tests. No test framework is configured anywhere.

## Architecture quirks

- `server.ts` is the real entrypoint for everything backend. In dev it mounts Vite middleware; in prod it serves `dist/`. It skips `app.listen` when `VERCEL` env is set (Vercel serverless mode via `api/index.ts`, which re-exports the Express app).
- Dual deployment: Render (`Dockerfile` + `render.yaml`, one container runs Python + Node via `start.sh`) and Vercel (`vercel.json`, two services with `PYTHON_URL` binding).
- Graceful degradation is a core pattern: MongoDB (lazy connect, 30s retry cooldown) and the Python sidecar both fail soft. `/api/py-health` returns `{available: bool}`; the client polls it every 15s (`startVaderHealthPolling` in `App.tsx`) and falls back to the built-in JS sentiment engine (`src/nlp/sentimentEngine.ts`) when the sidecar is down. Preserve this behavior.
- Two sentiment engines exist: Python VADER sidecar (preferred) and a full client-side JS engine (fallback). New scoring features should account for both paths.
- Causal/predictive engine lives in `python/causal_engine.py`, exposed via `/api/causal/*` proxies. `src/nlp/causalEngine.ts` is the client.
- `metadata.json` mentions Gemini but the server uses OpenAI — treat it as stale.

## Environment

- `.env` at repo root (gitignored) is read by both Node (`dotenv.config()` in `server.ts`) and Python (manual file parsing, searches `.env`, `../.env`, and paths relative to the file — no python-dotenv).
- Keys: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `RESEND_API` (note: not `RESEND_API_KEY`, though both are accepted), `RESEND_FROM`, `MONGO_URI`, `MONGO_DB`, `APIFY_API_KEY`, `FIRECRAWL_API_KEY`, `HF_API_TOKEN`, `PYTHON_URL` (default `http://127.0.0.1:8000`).
- All keys are optional; features show setup messages in the UI when missing.
- Express JSON body limit is 10mb (scraped-comment payloads).

## Conventions

- Path alias `@/` → repo root (configured in both `vite.config.ts` and `tsconfig.json`).
- TypeScript: `noEmit: true`, `allowImportingTsExtensions: true`; `server.ts` runs via `tsx`, never compiled.
- Python deps in `python/requirements.txt`; dev installs go into the repo-root `.venv` (not `python/.venv`).
- `DISABLE_HMR=true` env var disables Vite HMR/file-watching (used in AI Studio agent environments to avoid flicker). Do not remove this from `vite.config.ts`.
