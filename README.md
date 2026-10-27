# PilgrimAI (Unified Full-Stack Application)

PilgrimAI is a unified Next.js application built with React 19, TypeScript, Tailwind CSS, and Supabase. It integrates AI-powered pilgrimage guidance, trip planning, itinerary management, conversation history, and user favourites.

## Architecture

```text
Browser (React 19)
   │  POST /api/chat
   ▼
Next.js Route Handlers (/api/chat, /api/trips, /api/itineraries,
                        /api/conversations, /api/favourites, /api/users/me)
   ├── Domain Services (AiService, TripService, ItineraryService,
   │                    ConversationService, FavouriteService, UserService)
   │       └── Supabase PostgreSQL (auth + data, RLS per user)
   └── AiService → MULTIAGENT_API_URL (FastAPI backend, port 8000)
            safety → brain (LLM #1) → agents (Qdrant RAG / OSRM / data)
            → composer (LLM #2) → validator → reply + evidence
            (Redis holds short-term chat sessions, TTL 24 h)
```

Two runtimes are required: **Next.js (port 3000)** and the **multiagent backend (port 8000)**. If the backend is not running, every chat message returns `503 Multi-agent AI service is currently unavailable`.

## Prerequisites

- **Node.js 22.12 or later** (vitest 5 requires it; `npm test` fails on older Node)
- **Python 3.10 – 3.13** (backend)
- **Redis** running locally on `localhost:6379` (chat sessions + caches)
- A **Supabase project** (Google OAuth + database)
- A **Groq API key** (backend LLM calls)

## 1. Database setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Enable **Google** as an auth provider (Project settings → Authentication → Providers) and set the redirect URL to `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. In **SQL Editor → New query**, paste and run **`supabase/schema.sql`** (ships with this repo — creates `conversations`, `messages`, `trips`, `itineraries`, `itinerary_items`, `favourites` with row-level security).

> Skipping step 3 is the #1 source of errors: after signing in you will see `Failed to create conversation: relation "public.conversations" does not exist` (and the same for trips/favourites/itineraries).

## 2. Frontend configuration

```sh
cp .env.example .env        # Windows: copy .env.example .env
```

Fill `.env`:

```env
# Supabase (Auth, Database & Storage) — all three REQUIRED
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=          # optional; not used by app code today

# Multiagent AI backend (server-side only)
MULTIAGENT_API_URL=http://127.0.0.1:8000
```

> With missing/empty Supabase values the app intentionally renders the
> “sign-in is not configured” state instead of crashing.

**Security note:** keep keys server-side, never commit `.env`. The application callback is `/auth/callback`.

## 3. Multiagent backend setup (AI/RAG brain)

```sh
cd multiagent
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # then set at least:
                                   #   GROQ_API_KEY_1=<your groq key>
                                   #   REDIS_HOST=localhost / REDIS_PORT=6379
```

Start Redis (if not already running), e.g.:

```sh
redis-server                       # or: docker run -p 6379:6379 redis:7
```

Start the backend:

```sh
python -m uvicorn app.main:app --reload --port 8000
```

Notes:
- First temple query downloads the `BAAI/bge-m3` embedding model (≈2 GB) and/or loads the committed local Qdrant store under `multiagent/data/qdrant/` — allow time on a fresh machine.
- Google Maps key is **not** needed: routing is keyless (OSRM/Nominatim).

## 4. Run the frontend

```sh
npm install
npm run dev
```

Open http://localhost:3000 → sign in with Google → `/chat`.

## Run order (cheat sheet — two terminals)

```sh
# Terminal 1 — backend
cd multiagent && source .venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
npm run dev
```

## Health checks

| Check | Expected |
| --- | --- |
| `curl http://localhost:8000/health` | `{"status":"ok"}` |
| `curl http://localhost:3000/api/health` | `{"status":"ok"}` |
| `curl http://localhost:3000/api/auth/status` | `{"configured":true}` (after filling `.env`) |
| `curl -s localhost:8000/chat -H 'Content-Type: application/json' -d '{"message":"yadadri darshan timings"}'` | JSON with `"reply"` |

## Testing

```sh
npm run typecheck     # TypeScript
npm test              # Vitest unit tests
npm run build         # production build

cd multiagent
python -m compileall -q app tests   # syntax gate
python -m pytest tests -q           # backend tests (needs pip install -r requirements.txt)
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Chat: `503 Multi-agent AI service is currently unavailable` | Backend not running | Start uvicorn (step 3), check `:8000/health` |
| `Failed to create conversation: relation "public.conversations" does not exist` | `supabase/schema.sql` not run | Run it once in the SQL Editor |
| Login: “sign-in is not configured” | `.env` missing/empty Supabase values | Fill step 2 values, restart `npm run dev` |
| `Failed to reach ...:6379` warnings in backend logs | Redis not running | Start Redis (step 3) |
| `LLMUnavailable` / chat 503 with query-understanding message | `GROQ_API_KEY_1` missing/invalid | Set it in `multiagent/.env`, restart backend |
| Chat works but no cross-turn history / no shared cache | Redis not running | App auto-falls back to `multiagent/.session_fallback.json` (per-machine). For full behavior: `docker run -d -p 6379:6379 redis:7` or WSL `redis-server`, then restart uvicorn. |
| `npm test` refuses to start / engine warnings | Node < 22.12 | Upgrade Node (`node -v`) |
| Google login callback error | OAuth redirect URL mismatch | Set `https://<ref>.supabase.co/auth/v1/callback` in Google Cloud + Supabase |
