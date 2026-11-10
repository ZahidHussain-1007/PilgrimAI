# v20 — evidence-backed itinerary drafts

## What this patch does

- Replaces the Plan My Trip fake completion timer with an owned, persistent backend job. Actual stage snapshots drive the waiting view; terminal results replace it without an artificial minimum delay.
- Sends selected catalog IDs, explicit origin, dates, days, daily hours, party composition, budget preference/cap, mode, stay/diet/access requirements, room count, visit/rest allowances, priorities and attraction/estimate opt-ins through a signed same-origin Next gateway.
- Builds a deterministic, bounded multi-day schedule with opening windows, directed route legs, parking allowance, lunch/dinner allowances and en-route rests. Covers every mandatory temple exactly once or returns a conflict; it never silently drops a temple to claim success.
- Independently validates dates, chronology, required coverage, visit duration/window/evidence, route continuity and provider totals, return journeys, arrival allowance, rest and crossed meal thresholds.
- Shows saved drafts at `/itinerary/[id]` and `/itinerary`; adds drafts alongside the existing authenticated itinerary list without replacing cloud-trip APIs or authentication.
- Provides a native calendar date picker, selectable day timeline/calendar and UTF-8-folded RFC 5545 `.ics` export with IST converted to UTC.
- Provides redBus/AbhiBus entry links, IRCTC, OYO/Booking.com/MakeMyTrip searches and Google Maps directions/nearby-attraction links. Platform entry links intentionally do not invent vendor city IDs, schedules, prices or availability.
- Adds itinerary chat over saved evidence. A multi-capability question can return temple facts, routes, stay/food options, budget and nearby options together. The typed editor supports all planning inputs; changes are previewed and must be confirmed. Confirmation creates a new owned child ID with incremented version; the original remains available. The last ten exchanges are saved with the draft.
- Optionally uses the existing configured LLM key pool **only to interpret intent and propose constraints/sections**: one provider attempt, six-second cancellable wall-clock limit, 900 output tokens, 20 KB response limit, four concurrent requests. Unsupported output, provider failure or missing keys falls back deterministically. No LLM-generated operational fact enters the itinerary. `PLAN_INTENT_LLM=false` disables this optional call.
- Discovery uses the shared resolver/OSRM capability and an explicitly supplied origin. Without an origin it asks for one and does not claim nearest distances. It never assumes Hyderabad is the user's location.
- Adds the six supplied links with exact case checked against YouTube oEmbed. Komuravelli is `uaGrubVDiio`, Surendrapuri `cNrOLnMw7mA`, Manyamkonda `aNInk-5uK38`. Keeps the old and new Ramappa clips: **11 distinct temples / 12 clips**, not 12 distinct temples.
- New control copy and principal warnings are EN/TE/HI. Published catalog facts, normalizer rationale, source fields and technical diagnostics remain in their original language; the interface explicitly says so.

## Honest boundaries — this is not a production booking engine

1. **Routing policy:** every scheduled day starts and returns to the user's supplied daily base. The solver does **not** construct an overnight hotel-to-hotel touring route. Hotels, restaurants and nearby attractions are evidence-backed **options**, not inserted as invented operational stops. Meal/rest blocks do not assert a particular venue is open. Breakfast outside the planning period is not scheduled.
2. **Algorithm:** deterministic beam width 192, at most 12 seconds of search; no claim of global optimality or mathematical proof of infeasibility. Complete candidates that fit known cost bounds are preferred; otherwise the user receives cost conflicts. Without `quick`, it tries to spread visits over the requested days and balance active-day elapsed time; `quick` prefers fewer active days. `family` enforces at least 20 minutes of post-visit rest. History/Shakti/darshan interests are preserved, not used to invent new stops or spiritual scores. All requested dates are retained; unused dates are explicitly free days at the base.
3. **Hours:** `multiagent/data/planning_windows.json` conservatively normalizes the existing 23 catalog records, including weekday closures and general-darshan rather than ritual windows. Each entry pins a SHA-256 of the source `darshan_timings`. Changed source prose fails closed until the normalization is reviewed. Medaram has no verified ordinary-day public window and therefore cannot be silently scheduled from a past festival example. Public holidays, festivals, temporary closures, queues, floods and same-day changes are not certified.
4. **Transport:** OSRM provides a road-model estimate, not live traffic. Bus/train selections are explicitly labelled road scenarios with an unverified-service conflict. No bus/train boarding times, services, seats or fares are invented. A straight-line/30 km/h scenario requires explicit opt-in and retains its estimate label. No assumption that it is a verified road distance.
5. **Budget:** vehicle fuel is per vehicle using the configured fuel rate; meal arithmetic is per person/day only where catalog unit prices exist; stay scenarios are room-nights. Tickets/sevas, tolls, taxes, occupancy, missing food prices and public-transport/taxi fares remain unpriced as applicable. A known subtotal below a cap is **not** full budget feasibility: incomplete cap verification is a visible conflict. Hotel availability, occupancy and category are not certified. Jain/non-vegetarian suitability is not inferred from unknown or pure-veg records. Wheelchair/medical suitability requires direct confirmation and remains a conflict.
6. **Capabilities versus autonomous agents:** this path reuses the existing agents' deterministic catalog/provider/normalization/money-parser cores. It does **not** run every full LLM/RAG agent in sequence or claim autonomous fact verification. The saved evidence trace identifies the actual execution modes.
7. **Persistence:** atomic JSON snapshots on **one backend process / one persistent host**, under repository `.planning-runtime/jobs`. Two worker threads, eight outstanding jobs, two active per owner. A restart preserves completed drafts and marks interrupted pending work failed. Cancellation prevents final overwrite but does not instantly terminate in-flight provider calls. No Redis-distributed queue, Supabase itinerary sync, cross-host migration, cloud backups, anonymous-to-login migration or retention/deletion policy is implemented. Multiple Uvicorn worker processes are unsupported. Rotating the owner-derivation secret changes ownership hashes; plan migration before secret rotation.
8. **Privacy/auth:** authenticated ownership derives from verified user ID; anonymous ownership derives from an opaque HttpOnly SameSite cookie. Browser-supplied owner IDs/signatures are ignored. Backend planning routes require a timestamped HMAC binding owner, method, path and exact body. Unknown/other-owner jobs return 404. Anonymous drafts cannot be recovered after losing the cookie and are not automatically moved to a later login account. Existing auth/cloud features were not live-tested against a configured Supabase account.
9. **Video:** official YouTube player only, or existing owned/licensed HTML5 footage. No rehosting, iframe tricks, overlay masking, provider-UI hiding or static-image substitution was added. Actual YouTube playback was observed in this sandbox, but platform embedding/autoplay/network policy can vary. YouTube titles/watermarks/overlays and forced maximum quality cannot be guaranteed away. Licensed `public/videos/Txxxx.mp4|webm|ogv` is the existing clean-player route.
10. **Scope not completed:** live booking integrations, confirmed public-transport scheduling, automatic hotel-based multi-city routing, automatic timed attraction insertion and distributed/cloud itinerary persistence are not delivered by this patch. Do not describe this release as satisfying those stronger production requirements.

## Configuration

No SQL migration and no new runtime package is needed beyond the existing frontend/backend requirements. Use Node 22.12+ for the locked Next/Vitest versions. Python uses standard-library concurrency and existing FastAPI/Pydantic/httpx dependencies.

Set the **same** unpredictable `PLAN_SERVICE_SECRET` (at least 32 characters) in both Next and backend environments. Backend reads it from the process environment; use Uvicorn `--env-file` if storing it in a file. Merely adding it to the backend Pydantic `.env` file without loading it into the process does not configure this new signing boundary.

- Next: `MULTIAGENT_API_URL=http://127.0.0.1:8000` (server-side only).
- Production backend: `APP_ENV=production`; explicit shared secret is required.
- Production Next: explicit shared secret is required unless `PLAN_ALLOW_LOCAL_KEY=true` is deliberately set for a local single-host installation. That local escape hatch does not bypass backend production secret enforcement.
- Development only: if neither process has a secret, both can share the repository `.planning-runtime/proxy.key`. Do not mix one process's configured secret with another process's generated local key. Do not commit runtime snapshots or the key.
- Keep one Uvicorn worker and persist/mount `.planning-runtime` in a deployment. Do not deploy this file queue onto ephemeral/serverless storage and promise durable jobs.
- `PLAN_INTENT_LLM=false` disables optional intent interpretation. Planning itself never needs a paid LLM. Ordinary legacy chat routes retain their existing configuration/behavior.

## Windows apply and verify (PowerShell)

This patch is based on **`3d3b3327d8599e72444388baf6053b385bcca59e`**. It is not an incremental patch against the older `e48f93b` checkout. Save/commit local work first; do not reset or overwrite it. If the base check fails, stop and reconcile the branch rather than forcing an apply.

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI'
git status --short
git log -1 --oneline
# Stop if local edits exist. Fetch the audited base, preserving your current branch.
git fetch origin
git switch -c feat/v20-real-itinerary 3d3b3327d8599e72444388baf6053b385bcca59e
git apply --check 'C:\Users\lokes\Downloads\v20-real-itinerary.patch'
git am 'C:\Users\lokes\Downloads\v20-real-itinerary.patch'
npm ci
node --version
node_modules\.bin\tsc --noEmit
npx vitest run
Push-Location multiagent
python -m pytest -q
Pop-Location
# Stop any existing Next dev server before the production-build gate.
npm run build
```

Configure one shared local key without displaying it. If `.env.local` already has a key, retain that value instead of adding another. Keep the file private/untracked.

```powershell
if (-not (Test-Path '.env.local')) { New-Item '.env.local' -ItemType File | Out-Null }
if (-not (Select-String -Path '.env.local' -Pattern '^PLAN_SERVICE_SECRET=' -Quiet)) {
  $key = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  Add-Content -Path '.env.local' -Value "`nPLAN_SERVICE_SECRET=$key" -Encoding utf8
}
```

**Backend terminal — restart Uvicorn because this patch changes `multiagent`:**

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI\multiagent'
# Ctrl+C the old backend first. --env-file loads the SAME root key as Next.
python -m uvicorn app.main:app --env-file ..\.env.local --host 127.0.0.1 --port 8000 --reload
```

**Frontend terminal — restart after the config/build changes:**

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI'
npm run dev -- -p 3100
```

Open/reload `http://localhost:3100/plan`. Select temples, Continue, explicitly enter origin/date, then Plan My Trip. Saved drafts also appear at `http://localhost:3100/itinerary`. Fast jobs may finish before a video has time to load; the application deliberately does not slow them down.

### Browser regression

`p5-real-itinerary.mjs` runs Chromium at **1568×882** and checks the actual Next/backend flow, then mobile at 390×844. It prints PASS/FAIL and exits nonzero on failure. It uses real provider calls; no planning API is mocked. Install Playwright in an isolated tools directory if it is not already present. Point `PLAYWRIGHT_IMPORT` at its `index.mjs` as a `file:///` URL, or leave unset when `playwright` resolves locally. Install its Chromium browser with `npx playwright install chromium` in that tools directory. `PILGRIM_BASE_URL` optionally changes the default `http://127.0.0.1:3100`.

```powershell
# Example only: use the actual location of your installed Playwright.
$env:PLAYWRIGHT_IMPORT = 'file:///C:/path/to/browser-tools/node_modules/playwright/index.mjs'
node .\p5-real-itinerary.mjs
```

Evidence goes to ignored `shots/p5-v20-*` (JSON, screenshots, ICS). It includes exact request preferences and should not be committed or shared when testing private origins. The script tests anonymous ownership; authenticated account flows still need real Supabase credentials for live verification.

## Verification record

Final gates: TypeScript PASS; Vitest **135 passed / 22 files**; pytest **222 passed, 2 Redis tests skipped**; production build PASS; real Chromium regression **23 PASS / 0 FAIL**, including actual video-playing state. See `docs/v20-verification.json` for protected-file hashes and individual browser checks. Live LLM-provider interpretation and authenticated Supabase writes were not tested with real credentials. Baseline tests predating this implementation are not used as implementation evidence. Live provider observations are limited to this run; unit tests explicitly mock providers and are not availability certification.

No protected `chat.py`, `config.py`, `query.py`, `compose.py` or `llm.py` was edited. `main.py` only registers the new router. Original checkout `/home/user/PilgrimAI` remains untouched.
