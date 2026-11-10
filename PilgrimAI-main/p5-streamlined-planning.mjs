/* v23 real browser + real geocoding/OSRM. A held POST is not a mocked response.
   Any explicitly injected failure below is labelled as a UI fixture. */
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_IMPORT || "playwright"
);
const base = process.env.PILGRIM_BASE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1568, height: 882 },
  timezoneId: "Asia/Kolkata",
});
const page = await context.newPage();
const results = [],
  errors = [],
  cases = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (name, pass, details = "") => {
  results.push({ name, pass: !!pass, details });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} ${details}`);
};
await fs.mkdir("shots", { recursive: true });
let release;
async function terminal(id) {
  for (let n = 0; n < 100; n++) {
    const r = await page.request.get(base + "/api/planning/jobs/" + id);
    const j = await r.json();
    if (!["queued", "running"].includes(j.status)) return j;
    await page.waitForTimeout(1000);
  }
  throw new Error("Job did not finish");
}
try {
  await page.goto(base + "/plan");
  await page
    .getByRole("heading", { name: "Chat with PilgrimAI" })
    .waitFor({ timeout: 45000 });
  await page.getByRole("textbox", { name: /Search.*temple/i }).fill("Birla");
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "Birla Mandir Hyderabad" });
  await row.getByRole("button", { name: "Add", exact: true }).click();
  const h = await page
      .getByRole("heading", { name: "Choose Your Temple", exact: true })
      .boundingBox(),
    c = await page.locator("[data-top-continue] button").boundingBox();
  check(
    "Continue is on the right of the heading, not in a separate toolbar below",
    c.x > h.x + h.width && Math.abs(c.y - h.y) < 45,
    JSON.stringify({ heading: h, continue: c }),
  );
  await page.screenshot({ path: "shots/p5-v23-heading.png" });
  await page.locator("[data-top-continue] button").click();
  check(
    "Adults/children/elders replace the traveller total input",
    (await page.locator("[data-traveller-composition] input").count()) === 3 &&
      (await page.getByLabel("Adults", { exact: true }).count()) === 1 &&
      (await page.getByLabel("Children", { exact: true }).count()) === 1 &&
      (await page.getByLabel("Elderly", { exact: true }).count()) === 1,
  );
  const compose = await page
      .locator("[data-traveller-composition]")
      .boundingBox(),
    prefs = await page
      .getByRole("button", { name: /Additional preferences/i })
      .boundingBox();
  check(
    "Composition is in the main input area above Additional preferences",
    compose.y < prefs.y,
  );
  check(
    "Nearby attractions are enabled by default in Additional preferences",
    await page
      .getByLabel("Allow nearby attractions in the schedule", { exact: true })
      .isChecked(),
  );
  check(
    "Hotels are the default accommodation",
    (await page.getByLabel(/Accommodation/).inputValue()) === "hotel",
  );
  check(
    "Travel interests and overnight-policy selectors are removed",
    (await page.getByText("Travel interests", { exact: true }).count()) === 0 &&
      (await page.getByLabel("Overnight policy", { exact: true }).count()) ===
        0,
  );
  check(
    "Technical preferences are collapsed under More additional preferences",
    (await page.locator("[data-more-preferences]").evaluate((e) => !e.open)) &&
      !(await page.locator("input[type=time]").first().isVisible()),
  );
  await page.getByLabel("Adults", { exact: true }).fill("0");
  check(
    "No adult/elder composition cannot submit",
    await page
      .getByRole("button", { name: "Plan My Trip", exact: true })
      .isDisabled(),
  );
  await page.getByLabel("Adults", { exact: true }).fill("2");
  await page.getByLabel("Children", { exact: true }).fill("1");
  await page.getByLabel("Elderly", { exact: true }).fill("1");
  await page.getByLabel(/Starting city/).fill("nalonda");
  await page.locator("input[type=date]").fill("2026-11-12");
  await page.getByLabel(/Duration/).selectOption("2");
  await page.screenshot({ path: "shots/p5-v23-form.png", fullPage: true });
  let heldResolve;
  const held = new Promise((r) => (heldResolve = r)),
    gate = new Promise((r) => (release = r));
  let posts = 0;
  await page.route("**/api/planning/jobs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    heldResolve();
    await gate;
    await route.continue();
  });
  const response = page
    .waitForResponse(
      (r) =>
        r.url() === base + "/api/planning/jobs" &&
        r.request().method() === "POST",
    )
    .catch(() => null);
  const start = Date.now();
  await page.getByRole("button", { name: "Plan My Trip", exact: true }).click();
  await page.locator("[data-planning-experience]").waitFor({ timeout: 1500 });
  check(
    "Video waiting view appears before a planning response",
    true,
    `${Date.now() - start}ms`,
  );
  await page.waitForURL("**/planning/submit-*", { timeout: 45000 });
  await held;
  const frame = page.locator("[data-planning-experience] [data-engine]");
  const rect = await frame.boundingBox();
  check(
    "No application border or shell around the full-viewport player",
    rect.x === 0 &&
      rect.y === 0 &&
      rect.width === 1568 &&
      rect.height === 882 &&
      (await page.locator(".sidebar").count()) === 0,
  );
  check(
    "App Pause/Watch on YouTube control row is removed from transition",
    (await page.locator("[data-player-controls]").count()) === 0,
  );
  await page.locator("[data-playback=playing]").waitFor({ timeout: 20000 });
  check(
    "Selected Birla video genuinely plays",
    true,
    `reported quality=${await frame.getAttribute("data-quality")} (provider-controlled)`,
  );
  await page.evaluate(() => {
    window.__originalFrame = document.querySelector("[data-engine] iframe");
  });
  await page.screenshot({ path: "shots/p5-v23-video.png" });
  release();
  const created = await (await response).json();
  check(
    "Payload derives total 4 and automatic overnight/grid settings",
    created.request.adults === 2 &&
      created.request.children === 1 &&
      created.request.elderly === 1 &&
      created.request.stay === "hotel" &&
      created.request.stay_mode === "overnight" &&
      created.request.allow_unconfirmed_stay === true &&
      created.request.time_grid_minutes === 5 &&
      posts === 1,
    JSON.stringify(created.request),
  );
  await page.waitForURL("**/planning/" + created.id, { timeout: 30000 });
  check(
    "Accepted-job URL does not remount/restart the playing video",
    await page.evaluate(
      () =>
        window.__originalFrame ===
        document.querySelector("[data-engine] iframe"),
    ),
  );
  await page.waitForURL("**/itinerary/" + created.id, { timeout: 120000 });
  await page.locator("[data-itinerary-workspace]").waitFor();
  const saved = await terminal(created.id);
  await fs.writeFile(
    "shots/p5-v23-original.json",
    JSON.stringify(saved, null, 2),
  );
  check(
    "Unverified hotel no longer erases primary and all requested dates",
    saved.result?.days.length === 2 &&
      saved.result.days.every((d) => d.items.some((i) => i.type === "visit")) &&
      saved.result.days.some((d) =>
        d.items.some((i) => i.type === "visit" && i.place_id === "T0009"),
      ),
    JSON.stringify(saved.result?.conflicts),
  );
  check(
    "Conditional hotel route is explicitly incomplete, not booked/verified",
    saved.status === "needs_changes" &&
      saved.result.conflicts.some(
        (e) => e.code === "HOTEL_REQUIREMENTS_UNVERIFIED",
      ) &&
      saved.result.options.selected_hotel === null &&
      (await page.locator("[data-conditional-stay]").count()) === 1,
  );
  check(
    "All five-minute timestamps/durations are real saved values",
    saved.result.days.every((d) =>
      d.items.every((i) => {
        const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
        return (
          min(i.start) % 5 === 0 &&
          min(i.end) % 5 === 0 &&
          min(i.end) - min(i.start) === i.duration_minutes
        );
      }),
    ),
  );
  check(
    "No fake hotel/check-in or Day 1 home leg; stay price remains unknown",
    !saved.result.days[0].items.some((i) => i.to_id === "origin") &&
      !saved.result.days.some((d) =>
        d.items.some((i) => ["checkin", "checkout"].includes(i.type)),
      ) &&
      saved.result.budget.items.some(
        (i) => i.category === "stay" && i.quantity > 0 && i.unit_low === null,
      ),
  );
  await page.screenshot({ path: "shots/p5-v23-conditional-itinerary.png" });
  await page.unroute("**/api/planning/jobs");
  const req = {
    ...created.request,
    adults: 2,
    children: 0,
    elderly: 0,
    language: "en",
  };
  for (const origin of [
    "nalonda",
    "adilabad",
    "mahbubnagar",
    "nizambad",
    "khammam",
  ]) {
    const response = await page.request.post(base + "/api/planning/jobs", {
      data: { ...req, origin },
    });
    const j = await response.json();
    if (!j.id) {
      check("Live origin " + origin, false, JSON.stringify(j));
      continue;
    }
    const result = await terminal(j.id);
    await fs.writeFile(
      "shots/p5-v23-origin-" + origin + ".json",
      JSON.stringify(result, null, 2),
    );
    const ok =
      !!result.result &&
      result.result.days.every((d) =>
        d.items.some((i) => i.type === "visit"),
      ) &&
      result.result.days.some((d) =>
        d.items.some((i) => i.type === "visit" && i.place_id === "T0009"),
      ) &&
      !result.result.conflicts.some((e) =>
        [
          "PRIMARY_TEMPLE_MISSING",
          "DAY_UNPLANNED",
          "REQUIRED_VISIT_MISSING_OR_DUPLICATED",
        ].includes(e.code),
      );
    cases.push({
      origin,
      status: result.status,
      pass: ok,
      resolved: result.result?.origin,
      codes: result.result?.conflicts.map((e) => e.code),
      visits: result.result?.days.map((d) => ({
        date: d.date,
        visits: d.items
          .filter((i) => i.type === "visit")
          .map((i) => ({ id: i.place_id, start: i.start, end: i.end })),
      })),
    });
    check(
      "Real geocoding/OSRM and two-date conditional timeline: " + origin,
      ok,
      JSON.stringify(cases.at(-1)),
    );
  }
  // Explicit failure-view fixture: test correction UI without inventing production geocoder facts.
  await page.route("**/api/planning/jobs/" + created.id, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...saved,
        result: null,
        status: "failed",
        error_code: "originAmbiguous",
        error: "TEST ambiguity fixture",
        origin_candidates: [
          {
            display_name: "TEST candidate A",
            latitude: 17.05,
            longitude: 79.26,
          },
          {
            display_name: "TEST candidate B",
            latitude: 17.24,
            longitude: 80.15,
          },
        ],
      }),
    }),
  );
  await page.goto(base + "/itinerary/" + created.id);
  await page
    .getByRole("button", {
      name: "Retry with this starting place",
      exact: true,
    })
    .waitFor();
  check(
    "Ambiguous origin offers choices and a prefilled retry (explicit UI fixture)",
    (await page
      .getByRole("button", { name: "TEST candidate A", exact: true })
      .count()) === 1 &&
      (await page
        .getByLabel("Starting city / locality or coordinates", { exact: true })
        .inputValue()) === "nalonda",
  );
  await page.screenshot({ path: "shots/p5-v23-origin-recovery.png" });
  await page.unroute("**/api/planning/jobs/" + created.id);
  const retryResponse = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/planning/jobs" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "TEST candidate A", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Retry with this starting place",
      exact: true,
    })
    .click();
  const retried = await (await retryResponse).json();
  await page.waitForURL("**/itinerary/" + retried.id, { timeout: 90000 });
  await page.locator("[data-itinerary-workspace]").waitFor();
  await fs.writeFile('shots/p5-v23-origin-retry.json',JSON.stringify(await terminal(retried.id),null,2));
  check(
    "Ambiguity candidate retry completes real backend lifecycle and preserves trip context",
    retried.request.origin === "17.05,79.26" &&
      retried.request.days === 2 &&
      retried.request.adults === 2 &&
      retried.request.children === 1 &&
      retried.request.elderly === 1 &&
      retried.request.temple_ids[0] === "T0009" &&
      retried.request.primary_temple_id === "T0009" &&
      retried.request.include_attractions === true &&
      (await page.locator("[data-conditional-stay]").count()) === 1,
  );

  for (const [lang, label] of [
    ["te", "మరిన్ని అదనపు ప్రాధాన్యతలు"],
    ["hi", "और अतिरिक्त प्राथमिकताएँ"],
  ]) {
    await page.goto(base + "/plan");
    await page.evaluate(
      ({ req, lang }) => {
        sessionStorage.setItem("pilgrim:planning:edit", JSON.stringify(req));
        localStorage.setItem("pilgrim:language", lang);
      },
      { req, lang },
    );
    await page.reload();
    await page.locator("[data-more-preferences]").waitFor();
    check(
      lang + " simplified form labels are translated",
      (await page.getByText(label, { exact: true }).count()) === 1,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    "Mobile simplified form has no horizontal document overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "shots/p5-v23-mobile.png" });
  await page.evaluate(()=>{localStorage.setItem('pilgrim:language','en');sessionStorage.removeItem('pilgrim:planning:edit');});await page.goto(base+'/plan');await page.reload();await page.getByRole('heading',{name:'Choose Your Temple',exact:true}).waitFor();const mh=await page.getByRole('heading',{name:'Choose Your Temple',exact:true}).boundingBox(),mc=await page.locator('[data-top-continue] button').boundingBox();check('Mobile Continue remains to the right of the heading without overflow',mc.x>mh.x+mh.width&&Math.abs((mc.y+mc.height/2)-(mh.y+mh.height/2))<50&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'shots/p5-v23-mobile-heading.png'});
  check(
    "No runtime/hydration errors",
    errors.length === 0,
    JSON.stringify(errors),
  );
} catch (e) {
  release?.();
  results.push({ name: "Unexpected failure", pass: false, details: String(e) });
  console.error(e);
  await page.screenshot({ path: "shots/p5-v23-failure.png" }).catch(() => {});
} finally {
  await fs.writeFile(
    "shots/p5-v23-results.json",
    JSON.stringify({ results, errors, cases }, null, 2),
  );
  await browser.close();
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
