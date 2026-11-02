# v21 — evidence-aware multi-day pilgrimage planning

Baseline: committed v20 tree `94ff75a3d7b9d206fbb14becea3dd302c7d79742`.
Implementation branch: `feat/v21-complete-planning`. Original `/home/user/PilgrimAI` worktree was not edited.

**Scope statement:** the waiting-page UX, deterministic multi-day engine, candidate selection, independent acceptance gate and unit-aware budget ledger are implemented. This is **not** a claim of live hotel availability, a booked triple room, certified accessibility, current queue forecasts or fully priced real-world expenses. The supplied hotel records do not establish the occupancy/location needed for a real overnight Yadadri plan. Restaurant coordinates could not be reliably established for the original case. Those production-data blockers remain visible rather than being filled with fabricated values.

## 1. Root causes found before implementation

| Problem | Audited v20 cause | v21 change |
|---|---|---|
| Nov 4–5 displayed as Nov 3–4 | Day labels converted date-only values into IST-noon instants, then formatted in the browser timezone without specifying a timezone. | Calendar dates remain `YYYY-MM-DD`. Labels format a validated date-only identity in UTC; actual event instants use IST-to-UTC conversion. |
| Empty Day 2 marked successful | Beam completion checked mandatory-stop coverage, padded empty dates and accepted them in validation. | Every requested date needs a visit or is explicitly incomplete. A critical coverage failure cannot complete a job. |
| Nearby places were links only | Discovery output never entered the solver. | Evidence-bearing catalog candidates enter bounded combination/beam search; prose-only places remain unscheduled with reasons. |
| Hotel cost despite returning home | Routing always closed at origin; budget charged `(days-1) × rooms` from a stay preference. | Explicit `daily_return` / `overnight` policy. Return trips have zero room-nights. Overnight routing uses an evidenced property base. |
| Unestablished triple occupancy | Normalized hotel records lacked capacity, extra-bed policy and property coordinates. | Discovery, requirement match, availability verification and booking are distinct fields. Unknown occupancy is not a match. |
| Food not a real plan component | Anonymous lunch/dinner allowances; no breakfast or dated venue/transfer contract. | Applicable breakfast/lunch/dinner blocks; named venues require known coordinates, diet, both transfers and opening-window fit. Otherwise a clearly unconfirmed break remains. |
| Incomplete/coarse budget | Three categories, blanket three meals per person/day, generic room-night charge, no day-wise ledger. | Eight categories, actual selected activities, units/quantities, per-person and day totals, explicit estimates and unknowns. |
| Weak final explanation | Raw recursive evidence, generic links, no ordered daily map. | Overview, rationale, readable temple facts, hotel/food cards, attraction classifications, daily route schematic and navigation. |
| Additional first-request race | Concurrent cookieless list/create API requests could mint different anonymous identities; a late cookie could hide the created job. | Planning HTML navigation establishes the HttpOnly cookie before client effects. Existing valid cookies are not rotated. Signed API ownership remains unchanged. |

**Date diagnosis precision:** the old formatter reproduces exactly Nov 3 for the requested Nov 4 in `America/Los_Angeles`. The new tests reproduce that defect and verify the correction across five viewer timezones. This is sufficient to explain the reported symptom, but the user's Windows browser timezone was not inspected; it is not claimed as a forensically confirmed setting on that machine. The form/backend/storage path was not found to subtract a day. It preserves the original string in live API requests and saved snapshots.

## 2. Agent ownership and contracts

Existing agents, registry, chat route and protected composition/LLM code were not replaced. Planning adapters reuse existing deterministic normalization, money parsing, geography and routing integrations rather than making duplicate top-level agent/LLM retrieval calls.

| Responsibility | Owner / implementation | Structured output |
|---|---|---|
| Temple | `evidence.catalog`, existing temple evidence helpers | IDs, facts, coordinates, sources, last-verified date, general-darshan windows, source-derived visit/effort hints |
| Discovery | `discovery.discover` | Ranked catalog candidates; scheduled/optional/excluded classification and reasons |
| Travel | existing resolver / OSRM provider through `evidence` | Origin provenance; directed road matrix; raw routing minutes, traffic buffer, distance, source and explicit estimate flag |
| Calendar | existing `planning/calendar.py` | Date-keyed source-pinned windows, no invented festival/date-specific exceptions |
| Accommodation | `options.retrieve`, existing accommodation normalizer | Property/category/location/price evidence, capacity, extra-bed state, room/group requirement match, availability, booking state |
| Restaurant | same existing normalizer plus `options` / `venues` | Diet evidence, dated hours, price estimates, coordinate provenance, road-transfer eligibility |
| Itinerary | `engine.plan` + `solver.solve` | Deterministic candidate evaluation and timeline construction |
| Budget | `costing.calculate`, existing budget money parser/config | Eight-category day-wise ledger with explicit units and partial totals |
| Acceptance | `validation.validate` plus reused pure timeline checker | Recomputed critical errors and warnings, independent of the beam's success flag |
| Composition / follow-up | structured response + existing bounded intent layer | Saved evidence answers and reviewed request changes; no LLM-generated operating facts or timestamps |

`contracts.py` documents the adapter boundaries with TypedDict contracts. `PlanRequest` is runtime-validated by Pydantic; TypeScript describes the browser response. The contracts are not represented as live-provider certification. Acceptance is performed by the separate validation gate.

The optional understanding LLM remains bounded and can fall back deterministically. This patch does not introduce an autonomous free-form agent loop or call a narrative LLM to invent a schedule.

## 3. Implemented workflow

1. Validate the request: dates, primary ID, composition, finite money ranges, daily hours and contradictions. Overnight mode requires multiple days and a stay preference.
2. Create the durable owned job; return HTTP 202 promptly through the existing signed Next proxy.
3. Open `/planning/{id}` with a large selected-temple video and the actual job stage.
4. Retrieve the origin in parallel with local temple/calendar/discovery/stay/food work.
5. Conservatively attempt bounded venue coordinate enrichment. A name/type/scope match is not availability or occupancy verification. Ambiguous/unrelated hits stay unknown.
6. Build one deduplicated directed road matrix. Mandatory legs are prioritized over optional legs. Reuse this matrix for all candidate retries and the checked longer alternative.
7. Try bounded destination/hotel combinations; build timelines deterministically.
8. Calculate each candidate's ledger, independently validate it, and retain diagnostics. Retry within the search bound; do not repeatedly call route/LLM APIs for candidate permutations.
9. If required visits cannot fit, test a required-only longer alternative where possible, reusing routes and extending dated catalog windows. An unresolved hotel is not presented as fixable merely by adding a day.
10. Compose and atomically save a structured validated draft or an explicit `needs_changes` result. A critical failure never becomes `completed`.
11. The waiting route redirects on the real terminal state, including an incomplete result. There is no fake completion timer and no artificial minimum video delay.
12. Follow-up questions use the saved request/evidence. Changes require review, create a new owned revision and preserve the original.

Progress callbacks surround real schedule/budget/validation work. Candidate retries may revisit stages; there is no fabricated percentage progress.

## 4. Scheduling engine

- Primary temple is explicit, remains required, and cannot be silently removed by the editor. All other explicitly selected temples remain mandatory too.
- Candidates come from the real 23-record catalog within a bounded geographic discovery radius. Rank considers interests, distance and effort, then actual road/window/coverage/budget validation.
- At most eight eligible optional catalog candidates and three occupancy-matching locatable hotel candidates are considered. At most 16 combinations are evaluated, using beam width 96, at most two seconds per solve and a shared 12-second candidate-search budget.
- Search metadata distinguishes combination truncation from time exhaustion. **Neither failure nor success is a global optimality proof.**
- All requested dates must carry an activity. Empty dates retain their exact date and an explicit incomplete reason; they are never a successful free day.
- Default daily hours remain 07:00–21:00 IST, with a 75-minute visit/queue allowance and 15-minute rest. Elderly/access scenarios receive an additional mobility allowance; source-explicit longer visits are not shortened to 75 minutes.
- Example: the Surendrapuri general-entry source says the walk takes 2–3 hours. The conservative selected duration is 180 minutes (200 with the elderly allowance), not a fabricated 75-minute museum visit.
- The **whole** visit must fit inside one eligible opening window. At Yadadri, a 75-minute visit cannot start at 08:30 if that Sarva Darshan window ends at 09:00.
- Default traffic allowance is 15%, added transparently to OSRM's non-live road time; arrival/parking allowance is configurable (default 10 minutes). Straight-line scenarios require explicit opt-in and remain labelled estimates.
- Driving is split at meal/rest thresholds rather than being represented as uninterrupted long drives. Applicable breakfast is now included. Meals outside the actual activity period are not blindly charged.
- Daily return closes every active day at origin and charges no hotel. Overnight uses one selected hotel base, adds check-in/out allowance, avoids Day 1 home return and closes the final day at origin.
- Hotel alternatives are tried inside the bounded search, not permanently fixed before routing. Unknown capacity cannot be cured by assuming two people per room or an extra bed.
- No-climbing and daily-driving limits are hard constraints. A catalog mention of a lift/shuttle is not date-specific confirmation of step-free assistance. Longer walking effort is penalized for elderly/comfort scenarios.

## 5. Independent validator and completion rule

The acceptance module reconstructs the plan from its items and source records; it does not trust `feasible=True` from the constructive solver. It reuses the existing pure timeline checker, not beam-search state, and adds separate resource and cost checks.

Checks include:

- requested day count, exact ordered date range and active coverage on every date;
- every mandatory temple exactly once, explicit primary preservation, no unevidenced/duplicate visit;
- contiguous timing, duration arithmetic, opening-window fit and full visit allowance;
- route continuity, completed/split leg totals, provider distance/time/source evidence and daily base return;
- rest and crossed meal thresholds; named-venue location, diet evidence, both transfers and dated hours;
- hotel location/check-in/out, occupancy × rooms, overnight continuity and absence of premature home return;
- driving limits, climbing conflict, fatigue warnings and unresolved wheelchair/medical suitability;
- all eight ledger categories per date, unit arithmetic, actual fuel distance, meal quantities, parking quantities, admissions, room-nights, daily/category/group/per-person and known/estimated subtotals;
- unknown prices remaining null, correct completeness flags and hard-cap approval blocked by unpriced costs.

Tests deliberately tamper with dates, route totals, missing returns, visit duration/windows, rest, quantities, unknown-as-zero, subtotals and per-person totals. A numerically self-consistent but route-inconsistent fuel ledger is also rejected.

`completed` means a temporally accepted **planning draft**, not a reservation or verification of every price. Unpriced categories without a hard cap remain a conspicuous partial-budget warning. With a hard cap, those unknowns prevent approval. Strict unverified access/diet/timetable requirements remain critical.

## 6. Budget aggregation

The ledger covers fuel, tolls, parking, stay, food, general darshan/selected-service category, attraction entry and miscellaneous **on every requested date**.

- Fuel: actual chosen route km × the existing configured vehicle rate. Current configured assumptions are ₹116.15/litre and 14 km/litre, yielding a rounded ₹8.30/km. These are inherited planning assumptions, **not a live pump-price quote**. One vehicle is assumed.
- Food: actual scheduled meal blocks × travellers × a source-backed price scenario or an explicit user allowance. A nearby menu estimate does not establish a restaurant visit. Children use the stated adult-equivalent meal allowance unless better data is supplied.
- Stay: rooms × actual overnight nights, using only the selected matching property. Daily return is zero room-nights. Unknown occupancy/location blocks overnight selection rather than creating a fictional room charge.
- Admission: source-explicit free general darshan is zero; explicit adult admission is counted once per selected visit. Child height/age uncertainty is not filled with a guessed ticket rate. Optional paid sevas and unscheduled attractions are not charged.
- Tolls, parking and miscellaneous: unknown unless a quote or explicit user allowance is supplied; no invented defaults.
- Public transport/taxi fares are separately marked unknown rather than hidden in a zero fuel entry.

Outputs contain group range, per-person range, daily summaries, category summaries, quantities and price sources, catalog-priced subtotal, estimated subtotal, unknown categories, confidence and assumptions. `partial_subtotal` is **not an upper bound**. Unknown line-item prices are null, not zero. When nothing can be priced, the UI shows unknown instead of presenting an all-unknown trip as free.

The optional form/editor allowances are explicitly user planning inputs, not vendor prices. A fully covered estimate made from those allowances is still an estimate, not a guaranteed spend.

## 7. Response and presentation

Additive `schema_version: 21` snapshots include:

```text
request + date_contract + timezone
origin + temples + destinations + routes
selection_rationale + days[items, coverage, incomplete_reason, route_points, maps_url]
attractions[classification, reason, reason_codes]
options[hotels, restaurants, selected_hotel, notes, coordinate_discovery]
budget[items, categories, daywise, per_person, subtotals, missing, confidence]
validation[critical, warnings] + conflicts + search diagnostics + alternatives
warnings + agent_trace + review_required
```

The UI provides an overview, rationale and next actions; date-only day/calendar navigation; activity duration/source/leg links; readable temple windows/admission/dress/source facts; classified attractions; honest property/food cards; partial-budget summaries and source ledger; a visual daily route and ordered Google Maps navigation; advanced source evidence; and context-preserving chat/editor revisions.

**Map precision:** the embedded map is a coordinate schematic, explicitly labelled as not road geometry. It contains only scheduled stops, including hotel/named meal stops when actually selected. The navigation link contains the ordered scheduled locations. There is no fabricated road polyline, live traffic map or claim that Google and OSRM choose an identical road.

New interface strings have EN/TE/HI entries. Catalog descriptions and provider evidence remain in their source language, with an explicit notice; no unverified translation of operational facts is claimed.

## 8. Files changed and why

### Backend

- `planning/models.py`: additive validated policy, primary, buffers, driving limit and finite allowance fields.
- `planning/contracts.py` (new): structured adapter contracts.
- `planning/evidence.py`: provenance, source-explicit duration/effort, deduplicated priority road matrix; compatibility budget entry point delegates to the single ledger implementation.
- `planning/discovery.py` (new): real catalog ranking and explicit unresolved-place handling.
- `planning/options.py` (new): evidence-preserving hotel/food normalization, occupancy/category/diet/hour distinctions.
- `planning/venues.py` (new): bounded conservative geocoder matching and atomic best-effort public-POI cache.
- `planning/solver.py`: per-place durations, breakfast, policy-aware daily bases/check-in/out, meal venue transfers, hard driving pruning and coverage-first scoring.
- `planning/engine.py` (new): bounded destination/hotel candidate orchestration, acceptance retries, route maps, classified reasons and checked longer alternatives.
- `planning/costing.py` (new): selected-activity, day-wise unit ledger.
- `planning/validation.py` (new): independent acceptance and quantity/total checks.
- `planning/jobs.py`: parallel independent retrieval, real work stages, shared matrix, versioned result and completion gate.
- `planning/intent.py`: explicit overnight/daily-return/no-climbing/sightseeing follow-up proposals.
- `planning/api.py`: nearby follow-up uses saved classified attractions, not only the old prose list.

### Frontend

- `src/app/planning/[id]/page.tsx` and `PlanningJobPage.tsx` (new): dedicated owned-job waiting route and real terminal-state redirect.
- `PlanningExperience.tsx`: large video layout and actual-stage indication.
- `TripPlanner.tsx`: explicit policy, cost allowances, buffers, driving/climbing fields, primary/date contract and waiting-route navigation.
- `ItineraryWorkspace.tsx`: date-only formatting, new structured presentation, reviewed alternative/revision flow, expanded editor and legacy notice.
- `PlanSummary.tsx` (new): overview, route schematic, budget, temple facts and discovery cards.
- `src/lib/planning.ts`: additive response/request types, calendar date helper, timezone-aware export metadata.
- `planningV21Copy.ts` (new) and `planningCopy.ts`: EN/TE/HI new interface strings.
- `src/proxy.ts` (new): early anonymous identity bootstrap, scoped only to planning pages; no auth/navigation rewrite.

### Tests / evidence

- Updated `multiagent/tests/test_planning.py`: obsolete free-day/blanket-meal assertions replaced with the new explicit contract; retained prior gateway, ownership and revision tests.
- New `multiagent/tests/test_planning_v21.py`: A–G fixtures, independent mutations, geocoder honesty/cache, hotel alternatives and progress checks.
- `src/lib/__tests__/planning.test.ts`: five-timezone date/calendar tests and exact legacy Nov 3 reproduction.
- `tests/unit/planningOwner.test.ts` (new): cookie bootstrap/non-rotation/security flags.
- `p5-real-itinerary.mjs`: retained browser regression updated for the new route/labels/selection contract.
- `p5-complete-planning.mjs` (new): real original-case browser flow, dates, video, budget, revision, language and ownership.
- `p5-planning-cases.mjs` (new): real A–G behavior against the signed API/catalog/providers.
- This report and `docs/v21-verification.json`: implementation, gate and protected-file evidence.

**Protected files unchanged byte-for-byte:** `multiagent/app/api/chat.py`, `multiagent/app/core/config.py`, `multiagent/app/models/query.py`, `multiagent/app/pipeline/compose.py`, `multiagent/app/services/llm.py`. `main.py`, catalog JSON, normalized source-window data, package manifests and lockfile were not changed.

## 9. Migrations, persistence and applying safely

**No SQL migration and no new package dependency.** Existing Supabase trip/itinerary tables were not altered. Owned planning jobs remain atomic single-host JSON snapshots under `.planning-runtime/jobs`; public venue coordinate cache is under `.planning-runtime/venues`. Neither runtime jobs nor secrets are committed.

New request fields have defaults. Old v20 snapshots remain readable and display a legacy-validation notice with an explicit replan action; they are not silently rewritten or falsely certified by v21 checks. Replanning creates a new snapshot/revision.

Keep the existing shared `PLAN_SERVICE_SECRET`: changing it changes derived ownership and can orphan access to prior anonymous/account drafts. Run one backend worker with persistent runtime storage; this is not a distributed queue/database migration.

### Windows / PowerShell — apply, test, restart, reload

Use the already working **v20** checkout, not the pre-v20 base. A Windows `git am` commit may have a different commit hash but the same v20 tree; the context check below is authoritative. Download the patch as `C:\Users\lokes\Downloads\v21-complete-planning.patch`.

First press **Ctrl+C in the existing PilgrimAI Next and uvicorn terminals**. Do not remove `node_modules` or reinstall dependencies merely to apply this patch. If processes will not stop, inspect listeners before stopping them:

```powershell
$ids = Get-NetTCPConnection -LocalPort 3100,8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
$ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
# Only after confirming these listeners belong to PilgrimAI:
$ids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

Apply and run frontend gates from the repository root:

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI'
if (git status --porcelain) { throw 'Working tree is not clean. Preserve your changes before applying.' }
$patch = 'C:\Users\lokes\Downloads\v21-complete-planning.patch'
git apply --check $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch context check failed. Do not force it; verify that v20 is applied.' }
git switch -c feat/v21-complete-planning
if ($LASTEXITCODE -ne 0) { throw 'Branch creation failed. Check the existing branch name.' }
git am $patch
if ($LASTEXITCODE -ne 0) { throw 'git am failed. Inspect git status; use git am --abort only if abandoning this apply.' }
.\node_modules\.bin\tsc.cmd --noEmit
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
npm test -- --run
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
```

No dependency changes are in this patch. An npm install, native-file lock or missing dependency is not proof of patch failure. Do not delete the lockfile or run `npm audit fix` blindly.

The root `.env.local` must exist for the uvicorn command below and contain the **same existing** shared key used by Next. If it is missing, reuse the `PLAN_SERVICE_SECRET` from the existing environment or `.env`, or the existing `.planning-runtime\proxy.key` for a prior local-key installation. Do **not** generate a replacement for an established installation. If there was never an existing key or any saved plan, the earlier two-GUID setup remains suitable. Never print or paste the key into chat.

Backend terminal, using your existing configured Python environment:

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI\multiagent'
if (!(Test-Path '..\.env.local')) { throw 'Create the root .env.local with the existing shared planning secret first.' }
python -m pytest -q tests
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed. Confirm the active Python environment and test dependencies.' }
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file ..\.env.local
```

Frontend terminal:

```powershell
Set-Location 'C:\Users\lokes\Desktop\PilgrimAI\PilgrimAI'
npm run dev -- --hostname 0.0.0.0 --port 3100
```

Open `http://localhost:3100/plan`, then press **Ctrl+Shift+R**. Both servers must be restarted because backend planning code and Next proxy/types changed. Prefer a new v21 plan; use the explicit replan button for a saved v20 draft. Do not clear the ownership cookie if you want to retain access to anonymous saved plans.

The browser scripts need Playwright installed separately; no new project dependency is required for normal operation. They are intentionally anchored to the original Nov 4–5 regression and were run on Nov 2, 2026. The Python date-specific fixture clock is isolated to those tests so that the unit tests do not expire or change the production clock.

## 10. Tests and A–G outcomes

Final gate details and protected-file hashes are recorded in `docs/v21-verification.json` and the evidence archive.

- TypeScript `tsc --noEmit`: PASS.
- Frontend: **148 tests / 23 files PASS** (above the required 109 baseline).
- Backend: **271 PASS, 2 Redis integration tests SKIP**; external Redis was not configured.
- Production Next build: PASS, with development server stopped first, followed by a restart on port 3100.
- Real Chromium 156, desktop 1568×882: original-case flow **25 PASS / 0 FAIL**; preserved broader regression **23 PASS / 0 FAIL**. Mobile overflow, EN/TE/HI, cross-owner denial, revisions, source links, calendar export and actual video-playing state were exercised.
- Live A–G behavior: **7 expected-behavior checks PASS**. This does not mean seven bookable itineraries; C/F/G are expected incomplete outcomes.

| Case | Real catalog/provider outcome | Additional deterministic fixture coverage |
|---|---|---|
| A — one-day Yadadri | Accepted temporal draft, Nov 4; full 10:00–11:15 visit; partial budget is explicit. | Whole visit/window, eight categories, date and per-person arithmetic. |
| B — original two-day daily return | Both dates active; Yadadri then Surendrapuri; every day closes at origin; zero hotel charge. | Candidate selection and maps contain scheduled stops only. |
| C — two-day overnight | **Blocked correctly:** no established matching locatable three-adult property in supplied records. Not a successful real overnight trip. | With an explicitly labelled property fixture: check-in/out, hotel-base continuity, no Day 1 home return and room-night cost PASS; a second hotel is tried if the first has unavailable routes. |
| D — required Jogulamba/Alampur plus Yadadri | One-day request not accepted. A checked two-day alternative includes Yadadri Nov 4 10:00–11:15 and Jogulamba Nov 5 11:41–12:56. No substitute Shakti temple is used. | Explicit intercity fixture also rejects one day and validates two. |
| E — elderly/comfort/no climbing | 95-minute visits, 30-minute rest; selected an alternative without a documented climbing requirement. Budget/meal/access uncertainties remain stated. | Hard driving/no-climbing checks and strict wheelchair/medical non-certification. |
| F — restrictive budget | ₹100 cap is rejected; priced costs already exceed it, and unknown charges prevent approval. | Explicit user allowances can produce a fully covered planning estimate; no silent overrun. |
| G — missing facts/prices | No Jain venue/price is invented; incomplete result and unpriced food. Prose nearby places without coordinates/hours are not scheduled. | Missing **primary** hours are simulated only in test fixtures and yield an honest incomplete date. No production record was falsified to create this scenario. |

The named-restaurant path is tested with labelled coordinates/hours/road fixtures, including rejection after hours are removed. In the original live case, bounded geocoding did not establish safe venue matches, so breakfast/lunch remain unconfirmed venue blocks with real nearby restaurant discoveries, not fabricated restaurant stops.

## 11. Before / after — the original case

Inputs: Uppal, Hyderabad → T0001; Nov 4–5, 2026; three adults; car; hotel preference/one room; vegetarian; darshan priority; 07:00–21:00; 75-minute visit + 15-minute rest; nearby enabled; comfortable budget. The explicit v21 policy for this comparison is **daily return**.

| Area | v20 | v21 live result |
|---|---|---|
| Dates | Could show Nov 3–4 in a western browser timezone | Request, stored contract, timeline and calendar pane retain Nov 4–5; Los Angeles browser verified |
| Day 1 | Temple visit, with weak overall acceptance | Yadadri 10:00–11:15, entirely inside the published 10:00–11:45 window |
| Day 2 | Empty/free but completed | Surendrapuri 09:02–12:02, with the source-derived three-hour duration |
| Nearby | All links | Surendrapuri scheduled; other candidates classified with bounded-search/constraint reasons; Bhongir/Kolanupaka/Panagal prose not promoted without facts |
| Hotel | Search options plus possible charge despite daily return | Eight relevant Yadadri property discoveries; unknown capacity explicitly unconfirmed; zero charged nights in return mode |
| Meals | Anonymous allowances; no breakfast | Breakfast/lunch on each active day; venues explicitly unconfirmed; nearby vegetarian records with price/hour/source evidence |
| Budget | Coarse categories and blanket quantities | All eight categories/day, 12 person-meals for four scheduled group breaks, no fictional dinner or room charge |
| UX | Waiting embedded inside itinerary workspace | Dedicated large-video page; actual job completion opens itinerary; 1,098px player actually played during the run |

Observed priced subtotal **₹4,248.59–₹7,548.59 for the group**, or **₹1,416.20–₹2,516.20 per person**, **excluding unknown tolls, parking and miscellaneous costs**. This is not the final trip price or a maximum.

| Category | Priced amount / status |
|---|---|
| Fuel | ₹1,698.59 scenario: 106.71 km + 97.94 km at configured ₹8.30/km, one vehicle |
| Food | ₹1,500–₹4,800 catalog meal-price scenario, not confirmed venue bookings |
| Stay | ₹0; zero room-nights in daily-return mode |
| General darshan | ₹0 for the selected general-darshan evidence |
| Attraction entry | ₹1,050: catalog ₹350 adult admission × three; reconfirm current fee |
| Tolls / parking / miscellaneous | Unknown, excluded rather than treated as free |

Day-wise priced subtotals: Nov 4 ₹1,485.69–₹3,285.69; Nov 5 ₹2,762.90–₹4,262.90. The run obtained OSRM data for all 90 directed matrix pairs; the final timeline used only its chosen legs. Road time is non-live and includes the explicit buffer.

Switching the same request to overnight is **not** silently turned into daily return: it becomes `needs_changes` with `HOTEL_REQUIREMENTS_UNVERIFIED` until the property facts are sufficient.

## 12. Remaining limitations / what was not verified

1. **Real overnight Yadadri occupancy is not solved by these records.** All eight local records lack established three-adult capacity and property coordinates. No triple/extra-bed availability, current tax-inclusive room quote or booking was verified. Engine behavior with adequate facts is tested; real production success is not claimed.
2. **Named restaurant routing is conditional on coordinates and hours.** The original case could not safely establish venue coordinates with the bounded geocoder. Scheduled meal time is useful but is not a confirmed restaurant visit. Diet/kitchen/availability can still require direct confirmation.
3. **Not every nearby attraction is schedulable.** Bhongir, Kolanupaka and Panagal prose lacks the structured coordinate/hour/duration evidence required here. They remain optional with explicit missing-data reasons. There is no arbitrary web scraping or one-off Yadadri attraction database.
4. **Budget completeness depends on evidence/allowances.** No toll/parking API, live fuel-price feed, live taxi/public transport fare or room-rate API was added. One car is assumed; multi-vehicle capacity and cost allocation are not modeled. Optional paid sevas are not automatically selected or charged; this engine schedules general visits, not paid-seva booking slots.
5. **Hours are catalog-backed, not live date-specific certification.** Festival changes, closures, real queues, traffic, medical suitability and date-specific lift/shuttle operation were not verified. Strict unverified access or service timetable requirements cannot pass as verified.
6. **Bounded search can miss a feasible or cheaper plan.** Candidate/combination/time limits and single-hotel-base policy are explicit. A rejected search is not a proof that every possible route is impossible. Alternate hotel bases, multiple hotel moves and globally optimal vehicle routing are outside this patch.
7. **The visual map is schematic.** Road navigation is linked, but no road-geometry/live-traffic embedded map was implemented. Google navigation can differ from OSRM.
8. **Persistence remains single-host.** No Supabase planning-job migration, distributed queue, multi-worker concurrency or cross-device anonymous identity synchronization was added. Keep runtime files and the shared secret stable.
9. **Provider video constraints remain.** Supplied YouTube video playback was actually observed. YouTube UI/branding cannot be removed and maximum quality cannot be guaranteed. Clean licensed HTML5 footage remains supported only when the team supplies it; nothing was rehosted.
10. **Existing dependency security issue remains.** The sandbox `npm audit` reports one critical vulnerability on the installed Next dependency. Package/lockfile were deliberately left unchanged rather than applying an unreviewed forced upgrade. This is a public-deployment risk; test and review dependency remediation separately. Passing functional gates is not a security audit.
11. External Redis integration was skipped; live hotel booking, Supabase migrations and heavy RAG/provider credentials were not exercised. Source text is not newly translated or independently re-certified.

The patch closes the audited itinerary logic/UX failures and makes unresolved production facts explicit. It should not be described as a fully bookable or fully verified travel product.
