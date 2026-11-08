# v22 — immediate full-viewport video and Windows regressions

Apply **after v21** (`223f443f3492dd010c27ad6ed89025d78f42d4e4`, or the equivalent tree produced by Windows `git am`). The user's v21 apply, 148 frontend tests and build succeeded. Reinstalling npm dependencies is not the fix for this report.

## What was wrong

1. v21 awaited `POST /api/planning/jobs` on the form, then navigated using the returned job UUID. Cold Next compilation alone could keep the user on the form for seconds. Even the dedicated waiting page initially fetched the job before showing video.
2. The reported request combined `days: 1` with `stay_mode: overnight`. Backend rejection was correct: an overnight itinerary requires at least two days and an accommodation preference. The UI failed by dumping Pydantic's raw JSON/request payload and allowing that payload to overflow the form.
3. `test_catalog_normalization_all_23_all_weekdays_and_digest_fail_closed` used `Path.read_text()` without an encoding. Windows CP1252 could not decode the actual UTF-8 catalog. This was a test-file bug; production catalog reads already specify UTF-8.
4. `test_dead_key_is_revoked_and_skipped` replaced only Groq slots 1 and 2. Real slots 3–6 and other providers from the Windows `.env` still participated in round-robin selection. Its assertion could expose a configured key. This was not proof that production key rotation was broken.
5. The LAN HMR warning was a separate development-origin allowlist issue, not the cause of the backend's 422 response.

## Implemented behavior

- Clicking **Plan My Trip** synchronously stages the exact request in this tab's session storage and renders a full-viewport video view immediately. It navigates to `/planning/submit-{nonce}` without awaiting any planning API response.
- The dedicated page starts the actual POST after mounting. It shows the selected temples' existing real videos, not a static image pretending to be video. No sidebar or account shell remains over the video page.
- Before HTTP acceptance the status says **Sending your planning request**, not “job completed” or a fabricated percentage. After acceptance the route becomes `/planning/{real-job-id}` and polls actual job progress. Only an actual terminal result opens `/itinerary/{id}`.
- The entire video frame fills the browser viewport, with a small wait/cancel panel over the footage. Native browser/OS fullscreen is not forcibly requested. The existing fullscreen button remains available. YouTube title/branding/UI and source letterboxing are not removed, cropped or rehosted; playback still depends on provider/browser permission and network conditions.
- React StrictMode/remounts share one in-flight submission promise. Accepted IDs are saved so retry/reload can resume an existing job. Cancellation before the POST response marks the submission, then cancels the real job when its ID arrives. Backend ownership/idempotency remain the authority.
- One-day overnight contradictions are explained on the waiting page without an unnecessary POST. The app does not silently change the requested day count or overnight policy.
- **Edit request — keep my choices** restores the selected temples/primary, dates, origin, travellers, policy and other submitted form preferences. The user corrects the contradiction intentionally.
- Other backend 422 responses are sanitized by the Next gateway; raw Pydantic `input` payloads are not echoed. The waiting page shows localized correction/retry actions rather than raw JSON. Missing/expired pending submissions receive a recovery message.
- New labels/messages are available in EN/TE/HI.
- Pending submission records are tab-local and expire logically after one hour. They are not portable booking/job IDs. Accepted owned jobs remain on the existing backend store. Clearing tab storage or sharing a pending URL before acceptance cannot transfer that request to another browser.

## Windows test fixes

- The catalog test now explicitly reads UTF-8.
- Added a regression that simulates a CP1252 default for `Path.read_text` while running the same all-23-temples, all-weekdays/digest check.
- The dead-key test temporarily isolates **all six Groq slots and both additional provider slots**, and isolates/restores cursor, revoked-key and provider-cooldown state. No actual environment file or production credential is changed.
- Full backend tests were additionally run with synthetic extra provider credentials populated, confirming that the test does not accidentally depend on an empty developer key pool. No real API credential was used for that reproduction.
- This was tested in the Linux sandbox with CP1252 simulation, not on the user's Windows device. The normal Windows test command below remains the final local verification.

**Security action:** the pasted failure output included a real-looking Groq credential. Revoke/rotate the exposed credential with the provider, update the appropriate local secret setting and restart any process using it. Do not rotate `PLAN_SERVICE_SECRET` as part of this action; that is a different key and should remain stable for saved-job ownership. The exposed value is not reproduced in this report or evidence archive.

## Verification

- TypeScript: PASS.
- Vitest: **156 PASS / 24 files**.
- Full backend: **272 PASS, 2 external-Redis tests skipped**; one upstream LangChain deprecation warning. Includes Windows-locale simulation and populated synthetic credential-pool run.
- Production Next build: PASS with the development server stopped first; Next restarted on 3100 afterward.
- New real Chromium 1568×882 suite: **16 PASS**, including a deliberately **held actual POST**, selected-video playing before acceptance, full desktop/mobile frame dimensions, one POST, real terminal navigation, readable overnight correction, preserved inputs, TE/HI, missing-record recovery and an explicitly labelled server-422 failure fixture.
- Existing real-browser main suite: **25 PASS**; retained broader regression: **23 PASS**.
- No new runtime package or SQL migration. Five protected backend files and `main.py` remain byte-identical. Package manifest/lockfile are unchanged. v21 schedule, hotel-evidence and partial-cost limitations are not represented as fixed by this UI patch.

The immediate-view latency is an observation for this browser run, not a universal performance SLA. The important checked ordering is that the full-viewport view and dedicated waiting URL appear while the actual POST response is still held back. The final itinerary does not appear before a real terminal response.

## Files and scope

- `src/lib/planningSubmission.ts` (new): tab-local handoff, one in-flight submission, accepted-ID resume, correction data and pending cancellation.
- `TripPlanner.tsx`: immediate view/navigation; no job POST on the form; restoration of the submitted preferences; clear overnight rule near the policy selector.
- `PlanClient.tsx`: restore temple selections and form context on correction.
- `PlanningJobPage.tsx`: submit/response/poll/retry/correction ownership on the waiting page.
- `PlanningExperience.tsx`, `TempleVideoPlayer.tsx`: optional full-viewport mode, retaining the existing sequential/muted video engine and native provider behavior. Existing non-waiting discovery video layout stays unchanged.
- `src/app/planning/[id]/page.tsx`: waiting page without sidebar/header shell.
- `src/app/api/planning/[...path]/route.ts`: safe 422 response, unchanged signed ownership and 25-second upstream timeout.
- `planningV21Copy.ts`: additive EN/TE/HI strings; no response-schema migration.
- `next.config.ts`: optional explicit development-origin environment list, no wildcard LAN allow-all.
- `test_planning.py`, `test_hygiene.py`: encoding and test-pool isolation fixes; no edits to protected production config/LLM files.
- `planningSubmission.test.ts` (new), `planning.route.test.ts`, `p5-immediate-video.mjs` (new): handoff/cancellation/error and real-browser regressions.
- This guide.

## PowerShell — apply and verify

Download `v22-immediate-video.patch` into `C:\Users\lokes\Downloads`.

First **Ctrl+C in the existing Next terminal and uvicorn terminal**. Preserve all `.env` files and the shared `PLAN_SERVICE_SECRET`. Do not delete `node_modules` or `package-lock.json` and do not regenerate the shared secret.

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI'
if (git status --porcelain) { throw 'Preserve your current changes before applying.' }
$patch = 'C:\Users\lokes\Downloads\v22-immediate-video.patch'
git apply --check $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch context failed. Verify v21 is applied; do not force it.' }
git switch -c feat/v22-immediate-video
if ($LASTEXITCODE -ne 0) { throw 'Branch creation failed. Inspect the existing branch name.' }
git am $patch
if ($LASTEXITCODE -ne 0) { throw 'Apply failed. Inspect git status; do not continue blindly.' }
.\node_modules\.bin\tsc.cmd --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed.' }
.\node_modules\.bin\vitest.cmd run
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI\multiagent'
python -m pytest -q tests
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed. Preserve the output, but redact credentials before sharing.' }
```

### Terminal A — backend, keep it running

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI\multiagent'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file ..\.env.local
```

### Terminal B — frontend, keep it running separately

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI'
npm run dev -- --hostname 0.0.0.0 --port 3100
```

Open **http://localhost:3100/plan** and press **Ctrl+Shift+R**. Keep both terminals running simultaneously; do not stop uvicorn to launch npm in the same terminal.

If you specifically open the LAN URL `http://172.20.0.1:3100`, stop Next and launch **Terminal B** with:

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI'
$env:PILGRIM_DEV_ORIGINS = '172.20.0.1'
npm run dev -- --hostname 0.0.0.0 --port 3100
```

Use the actual current LAN hostname/IP if it changes. This setting only controls development resources; it does not disable the signed API gateway's origin/ownership checks. Using `localhost` does not require this setting.

### Manual checks after reload

1. Select a temple and complete a valid request. Click Plan My Trip: the video view should replace the form immediately, without waiting for the job POST. The URL becomes `/planning/submit-…`, then `/planning/{job-id}` after acceptance, then the real terminal itinerary.
2. Set one day + overnight + hotel. Click: the same video page should explain the two-day requirement, not print JSON or a wide request body. Edit the request and confirm your date, origin, group and temple remain intact. Choose daily return for one day, or choose at least two days for overnight.
3. Remember that real hotel evidence can still block an overnight itinerary after these input corrections. This patch changes the waiting/error UX, not hotel availability.

The existing critical Next dependency audit finding remains separate. No blind `npm audit fix` or dependency upgrade was applied.
