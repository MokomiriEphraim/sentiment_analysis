# Cloud Sentiment

Client-side sentiment & emotion intelligence workbench. React 19 + Vite 8 + Tailwind 4 SPA served by a single Express server (`server.ts`), with an optional Python VADER sidecar for cross-model verification.

## Quick start

```bash
npm install
npm run dev                 # → http://localhost:3000
```

Optional — Python VADER sidecar (enables the "Python VADER" second opinion):

```bash
python3 -m venv .venv
.venv/bin/pip install -r python/requirements.txt
npm run sidecar              # → http://127.0.0.1:8000
```

## Configuration

Create `.env` in the repo root (the server reads `.env`, **not** `.env.local`):

| Key | Used for | Without it |
|---|---|---|
| `OPENAI_API_KEY` | Neural analysis (`/api/neural-deep-sense`) | Endpoint returns `available: false`, UI falls back to local engine |
| `FIRECRAWL_API_KEY` | Comment scraping on the Live Comments tab (`/api/scrape-comments`, platforms without an Apify actor — Facebook / X / Reddit) | Tab shows a clear "not configured" message |
| `APIFY_API_KEY` | TikTok + Instagram + YouTube comments (`/api/scrape-comments` → one Apify actor per platform) | Those links show a clear setup message |
| `PYTHON_URL` | Sidecar base URL (default `http://127.0.0.1:8000`) | Default used |
| `MONGO_URI` | MongoDB — persists every scraped comment pull, linked to the device that ran it (`devices` / `pulls` / `comments`); the Live Comments **Pull history** card reads them back per-device | Scrapes still work, nothing is saved |
| `RESEND_API` | Email delivery for the assistant's "send the report to …" flow (Resend). `RESEND_FROM` overrides the sender (default `onboarding@resend.dev`) | Assistant explains email isn't configured |
| `MONGO_DB` | Mongo database name (default: the one in the URI) | Default used |
| `OPENAI_MODEL` | Model override (default `gpt-4o-mini`) | Default used |
| `OPENAI_TRANSCRIBE_MODEL` | Speech-to-text model for voice input on browsers without live recognition (default `whisper-1`) | Default used |
| `OPENAI_BASE_URL` | API base override (proxies/compatible endpoints) | Default used |

Restart `npm run dev` after editing `.env`. All keys are optional — the app runs fully without them using the local rules engine.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Express + Vite middleware, port `PORT` or 3000) |
| `npm run lint` | Typecheck (`tsc --noEmit`) — the only automated check |
| `npm run build` | Production build → `dist/` |
| `npm run sidecar` | Python VADER sidecar (port 8000) |
| `NODE_ENV=production npm start` | Serve `dist/` (run `npm run build` first) |

## How analysis works

- **Workbench (main engine): Python VADER sidecar** — overall score, sentence scores, word scores, and emoji scores all come from the model (`/api/py-analyze`, `/api/py-sentences`, `/api/py-words` → sidecar `/analyze`, `/sentences`, `/words`). Keep `npm run sidecar` running.
- **Fallback**: if the sidecar is down, the built-in rules engine fills in and the badge shows "VADER offline — fallback". The app polls `/api/py-health` every 15s and re-scores automatically when the sidecar comes back — no typing needed.
- **Emoji panel** (Workbench): emojis you type are scored by VADER; if there are no emojis, it suggests a few that match your text's emotion (e.g. anger → 😠 😡 💢).
- **Cloud AI**: `/api/neural-deep-sense` powers the AI Deep Analysis modal (strict JSON schema). `/api/assistant` powers the floating **Help Assistant** widget (bottom-right, all tabs) — it answers "how do I…", setup, and troubleshooting questions about the app itself.
- **Voice input** (Workbench → Voice sub-view): pick one of the 11 SA languages, hit Start, talk. Chrome/Edge transcribe **live for free** in the browser (Web Speech API); Firefox/Safari record with MediaRecorder and send the audio to `/api/transcribe` (Whisper via `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL` override — default `whisper-1`). Stop & Add to Text drops the transcript into the editor → the full pipeline scores it (local rules → VADER → cloud-AI pass for non-English). Recordings cap at 2 minutes.
- **Live Comments**: paste a TikTok / YouTube / Instagram / Facebook post link — TikTok, YouTube and Instagram links go through dedicated Apify actors (`APIFY_API_KEY`), remaining platforms through Firecrawl (`FIRECRAWL_API_KEY`); every comment gets the same VADER score as the rest of the app, and the pie / spike alert / filters work off the real data. **South African languages supported:** VADER only reads English, so any comment it scores exactly 0.00 (isiZulu, Sesotho, Setswana, Xitsonga, Afrikaans, slang like "eish") is re-scored in one batched pass with the cloud AI (`OPENAI_API_KEY` required; the info line shows how many were AI-scored). When `MONGO_URI` is set, every pull is saved to MongoDB — comments linked to the pull *and* to the browser device (screen, timezone, language…) that ran it — and a **Pull history** card lists this device's saved scrapes: tap **View** to reload a past pull's comments into the table (re-scored with the same VADER + AI pipeline), or the trash icon to delete it. The **CSV** button in the table's filter bar exports every loaded comment (source, time, author, text, score, label, emotion, tone, sarcasm flag) as a spreadsheet-ready file. The ↗ arrow on a comment loads it into the Workbench tab for a full single-text analysis.

See `AGENTS.md` for repo-specific architecture notes and gotchas.
