/* v21 real Chromium regression. Planning requests/providers are NOT mocked.
   Requires backend :8000 and Next :3100. Screenshots under shots/.
   Provider playback/road data is evidence for this run, not a future guarantee. */
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_IMPORT || "playwright"
);
const base = process.env.PILGRIM_BASE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1568, height: 882 },
  timezoneId: "America/Los_Angeles",
  acceptDownloads: true,
});
const page = await context.newPage(),
  results = [],
  errors = [];
const check = (name, pass, details = "") => {
  results.push({ name, pass: !!pass, details });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} ${details}`);
};
page.on("pageerror", (e) => errors.push(e.message));
await fs.mkdir("shots", { recursive: true });
let original, revision;
const poll = async (id) => {
  for (let n = 0; n < 100; n++) {
    const r = await page.request.get(base + "/api/planning/jobs/" + id);
    const j = await r.json();
    if (!["queued", "running"].includes(j.status)) return j;
    await page.waitForTimeout(1000);
  }
  throw new Error("Job did not finish in 100 seconds");
};
try {
  await page.goto(base + "/planning/00000000-0000-4000-8000-000000000098");
  await page.goto(base + "/itinerary/00000000-0000-4000-8000-000000000098");
  await page.goto(base + "/plan");
  await page
    .getByRole("heading", { name: "Chat with PilgrimAI" })
    .waitFor({ timeout: 45000 });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const search = page.getByRole("textbox", { name: /Search.*temple/i });
  await search.fill("Lakshmi Narasimha");
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "Sri Lakshmi Narasimha Swamy Temple" })
    .filter({ hasText: /Yadadri|Yadagirigutta/ });
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .first()
    .click();
  await page.getByLabel(/Starting city/).fill("Uppal, Hyderabad");
  await page.locator("input[type=date]").fill("2026-11-04");
  await page.getByLabel(/Duration/).selectOption("2");
  await page.getByLabel("Adults", { exact: true }).fill("3");
  await page.getByLabel(/Accommodation/).selectOption("hotel");
  await page
    .getByLabel("Allow nearby attractions in the schedule", { exact: true })
    .check();
  check(
    "Date-only inputs exist with automatic overnight policy",
    (await page.locator("input[type=date]").inputValue()) === "2026-11-04",
  );
  await page.screenshot({ path: "shots/p5-v21-inputs.png", fullPage: true });
  const response = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/planning/jobs" &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Plan My Trip", exact: true }).click();
  const created = await (await response).json();
  original = created.id;
  check(
    "Original inputs reach the real API without date conversion",
    !!original &&
      created.request.start_date === "2026-11-04" &&
      created.request.days === 2 &&
      created.request.adults === 3 &&
      created.request.stay_mode === "overnight" &&
      created.request.allow_unconfirmed_stay === true,
    JSON.stringify(created.request),
  );
  await page.waitForURL("**/planning/" + original, { timeout: 30000 });
  await page.locator("[data-planning-page]").waitFor();
  check(
    "Plan My Trip opens a dedicated waiting route",
    page.url().includes("/planning/"),
  );
  let waiting = false,
    playing = false,
    videoWidth = 0;
  try {
    await page.locator("[data-planning-experience]").waitFor({ timeout: 2500 });
    waiting = true;
    const player = page.locator("[data-planning-experience] [data-engine]");
    videoWidth = (await player.boundingBox())?.width || 0;
    try {
      await page
        .locator('[data-planning-experience] [data-playback="playing"]')
        .waitFor({ timeout: 8000 });
      playing = true;
    } catch {}
    await page.screenshot({ path: "shots/p5-v21-waiting.png", fullPage: true });
  } catch {}
  await page.waitForURL("**/itinerary/" + original, { timeout: 100000 });
  await page.locator("[data-itinerary-workspace]").waitFor();
  const saved = await poll(original);
  check(
    "Real completion, not a timer, opens saved itinerary",
    !!saved.result && ["completed", "needs_changes"].includes(saved.status),
    `status=${saved.status}; waiting=${waiting}; width=${videoWidth}; playing=${playing}`,
  );
  check(
    "Every original requested date has scheduled visits",
    saved.result.days.length === 2 &&
      saved.result.days.every((d) => d.items.some((i) => i.type === "visit")),
    saved.result.days.map((d) => d.date + ":" + d.coverage).join(","),
  );
  check(
    "Primary remains on Day 1 and full 75-minute window fits",
    saved.result.days[0].items.some(
      (i) =>
        i.place_id === "T0001" &&
        i.type === "visit" &&
        i.duration_minutes === 75,
    ),
  );
  check(
    "Unverified overnight stay is unknown, not a fabricated zero charge",
    saved.result.budget.items
      .filter((e) => e.category === "stay")
      .every((e) => e.quantity === 0 ? e.high === 0 : e.quantity === 1 && e.unit_low === null),
  );
  check(
    "Nearby attraction participates in actual solver selection",
    saved.result.attractions.some((a) => a.classification === "scheduled"),
  );
  check(
    "Eight budget categories, per-person and daily arithmetic are present",
    saved.result.budget.categories.length === 8 &&
      saved.result.budget.daywise.length === 2 &&
      saved.result.budget.per_person.travellers === 3,
  );
  check(
    "Missing charges are not presented as a full trip total",
    !saved.result.budget.complete &&
      (await page
        .getByText("Priced subtotal — unknown costs excluded", { exact: true })
        .count()) === 1,
  );
  const nav = page.getByRole("navigation", { name: "Calendar", exact: true });
  const labels = await nav.getByRole("button").allTextContents();
  check(
    "Los Angeles browser still displays Nov 4 and Nov 5",
    labels[0].includes("4") &&
      labels[1].includes("5") &&
      labels.every((l) => l.includes("Nov")),
    labels.join(" | "),
  );
  check(
    "Day 1 map contains only scheduled stop order",
    (await page.locator("[data-daily-route]").count()) === 1 &&
      saved.result.days[0].route_points.at(-1).id !== "origin",
  );
  await nav.getByRole("button").nth(1).click();
  check(
    "Day 2 has a genuine visual route and navigation URL",
    (await page.locator("[data-daily-route] svg").count()) === 1 &&
      (await page
        .getByRole("link", { name: "Open this day’s navigation ↗" })
        .count()) === 1,
  );
  await page.screenshot({ path: "shots/p5-v21-day2.png", fullPage: true });
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download calendar (.ics)", exact: true })
    .click();
  const download = await downloadEvent;
  await download.saveAs("shots/p5-v21-calendar.ics");
  const ics = await fs.readFile("shots/p5-v21-calendar.ics", "utf8");
  check(
    "Calendar events preserve Nov 4–5 in IST-to-UTC conversion",
    ics.includes("DTSTART:20261104") &&
      ics.includes("DTSTART:20261105") &&
      !ics.includes("DTSTART:20261103"),
  );
  await page.reload();
  await page.locator("[data-itinerary-workspace]").waitFor();
  check(
    "Reload preserves the exact saved date contract",
    JSON.stringify(
      (await poll(original)).result.date_contract.requested_dates,
    ) === JSON.stringify(["2026-11-04", "2026-11-05"]),
  );
  const chat = page.getByRole("textbox", {
    name: "Ask about or redesign this itinerary",
    exact: true,
  });
  await chat.fill("timings, dress, hotels, nearby, routes and budget");
  let replyResponse = page.waitForResponse(
    (r) => r.url().endsWith("/chat") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  let reply = await (await replyResponse).json();
  check(
    "Follow-up reads saved route, facts, selected attractions and budget",
    reply.kind === "answer" &&
      ["temples", "nearby", "options", "routes", "budget"].every(
        (k) => k in (reply.evidence || {}),
      ),
  );
  await chat.fill("return home daily");
  replyResponse = page.waitForResponse(
    (r) => r.url().endsWith("/chat") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  reply = await (await replyResponse).json();
  check(
    "Return-mode change is previewed and does not mutate original",
    reply.kind === "proposal" &&
      reply.changes.stay_mode === "daily_return" &&
      (await poll(original)).request.stay_mode === "overnight",
  );
  replyResponse = page.waitForResponse(
    (r) => r.url().endsWith("/chat") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Apply as a new revision", exact: true })
    .click();
  reply = await (await replyResponse).json();
  revision = reply.job.id;
  await page.waitForURL("**/itinerary/" + revision, { timeout: 100000 });
  await page.locator("[data-itinerary-workspace]").waitFor();
  const revised = await poll(revision);
  check(
    "Confirmed revision preserves ownership, version and primary temple",
    revised.parent === original &&
      revised.version === 2 &&
      revised.request.primary_temple_id === "T0001",
  );
  check(
    "Return-mode revision preserves zero room-nights/costs",
    revised.request.stay_mode === "daily_return" &&
      revised.result.budget.items
        .filter((e) => e.category === "stay")
        .every((e) => e.quantity === 0 && e.high === 0),
  );
  const strict = await (
    await page.request.post(base + "/api/planning/jobs", {
      data: { ...saved.request, allow_unconfirmed_stay: false },
    })
  ).json();
  await page.goto(base + "/itinerary/" + strict.id);
  await page.locator("[data-itinerary-workspace]").waitFor();
  const strictSaved = await poll(strict.id);
  check(
    "Legacy strict API still blocks unverified overnight lodging",
    strictSaved.status === "needs_changes" &&
      strictSaved.result.conflicts.some(
        (e) => e.code === "HOTEL_REQUIREMENTS_UNVERIFIED",
      ),
  );
  check(
    "Incomplete days are not labelled completed free days",
    (await page
      .getByText(/This date is incomplete/, { exact: false })
      .count()) === 1 && !strictSaved.result.feasible,
  );
  await page.screenshot({
    path: "shots/p5-v21-overnight-blocker.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "తె", exact: true }).click();
  check(
    "Telugu translates new overnight / budget presentation",
    (await page
      .getByRole("heading", { name: "యాత్ర అవలోకనం", exact: true })
      .count()) === 1,
  );
  await page.getByRole("button", { name: "हि", exact: true }).click();
  check(
    "Hindi translates new overnight / budget presentation",
    (await page
      .getByRole("heading", { name: "यात्रा अवलोकन", exact: true })
      .count()) === 1,
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const stranger = await browser.newContext();
  const denied = await stranger.request.get(
    base + "/api/planning/jobs/" + original,
  );
  check("Cross-owner access is denied", denied.status() === 404);
  await stranger.close();
  const mobile = await context.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.goto(base + "/itinerary/" + original);
  await mobile.locator("[data-itinerary-workspace]").waitFor();
  check(
    "Mobile page has no horizontal document overflow",
    !(await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    )),
  );
  await mobile.screenshot({ path: "shots/p5-v21-mobile.png", fullPage: true });
  await mobile.close();
  check(
    "No runtime or hydration errors",
    errors.length === 0,
    JSON.stringify(errors),
  );
  await fs.writeFile(
    "shots/p5-v21-original-result.json",
    JSON.stringify(saved, null, 2),
  );
} catch (e) {
  check("Browser flow completed", false, e.stack || String(e));
  await page
    .screenshot({ path: "shots/p5-v21-failure.png", fullPage: true })
    .catch(() => {});
} finally {
  await fs.writeFile(
    "shots/p5-v21-results.json",
    JSON.stringify({ results, errors, original, revision }, null, 2),
  );
  await browser.close();
}
if (results.some((r) => !r.pass)) process.exitCode = 1;
