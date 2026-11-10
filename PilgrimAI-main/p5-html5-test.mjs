import { chromium } from "playwright"

/** HTML5 (owned-file) player verification. Requires public/videos/T0010.webm
 *  + T0009.webm fixtures (deleted after testing — never shipped). */
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1568, height: 882 },
  recordVideo: { dir: "shots/_rec", size: { width: 1280, height: 720 } },
})
const page = await ctx.newPage()
const out = []
const log = (k, v) => out.push(`${v ? "PASS" : "FAIL"} ${k}`)

async function addTemple(name) {
  const li = page.locator("li", { hasText: name }).first()
  const btn = li.getByRole("button", { name: /^Add$/ })
  await btn.waitFor({ state: "visible", timeout: 30000 })
  await btn.click()
  await li.getByRole("button", { name: /added/i }).waitFor({ state: "visible", timeout: 10000 })
}

try {
  await page.goto("http://localhost:3100/plan", { waitUntil: "domcontentloaded" })
  await page.locator("li", { hasText: "Sri Sanghi Temple" }).first().waitFor({ state: "visible", timeout: 30000 })
  await page.waitForTimeout(600)
  await addTemple("Sri Sanghi Temple")
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  const frame = page.locator("[data-playback]")
  await frame.waitFor({ state: "visible", timeout: 30000 })

  // 1. HTML5 engine: video element, NO iframe, playing
  let st = "?"
  for (let i = 0; i < 40; i++) {
    st = (await frame.getAttribute("data-playback")) || "?"
    if (["playing", "blocked", "empty", "error"].includes(st)) break
    await page.waitForTimeout(400)
  }
  const eng = await frame.getAttribute("data-engine")
  const vids = await frame.locator("video").count()
  const iframes = await frame.locator("iframe").count()
  log(`1 HTML5 engine + playing (engine=${eng} state=${st} video=${vids} iframe=${iframes})`, eng === "html5" && vids === 1 && iframes === 0 && st === "playing")

  // 2. hover sweep over center/top/bottom/corners → only fullscreen in frame
  const fb = async () => frame.locator("button").count()
  const box = await frame.boundingBox()
  const pts = [
    [0.5, 0.5], [0.5, 0.05], [0.5, 0.95], [0.05, 0.05], [0.95, 0.05],
    [0.05, 0.95], [0.95, 0.95], [0.25, 0.5], [0.75, 0.5],
  ]
  for (const [fx, fy] of pts) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 6 })
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(400)
  const btnsAfterHover = await fb()
  const titleish = await frame.locator('[class*="ytp-title"], [class*="ytp-chrome"], [class*="ytp-pause-overlay"]').count()
  log(`2 hover sweep: no app/provider title UI, only fullscreen (buttons=${btnsAfterHover} ytTitleUi=${titleish})`, btnsAfterHover === 1 && titleish === 0)
  await page.screenshot({ path: "shots/p5-html5-1568x882.png" })

  // 3. no app overlays: badge/title strip/watch-link absent
  const badge = await page.getByText("Temple Experience", { exact: true }).count()
  const watch = await page.getByText("Watch on YouTube").count()
  log(`3 no app overlays (badge=${badge} watchLink=${watch})`, badge === 0 && watch === 0)

  // 4. single-video continuous loop (clip ~2.2s; after >2 cycles still playing, not ended)
  await page.waitForTimeout(4800)
  const loop = await page.evaluate(() => {
    const v = document.querySelector("[data-playback] video")
    if (!v) return { ok: false, why: "no video" }
    return { ok: !v.ended && !v.paused && v.currentTime < v.duration + 0.1, t: v.currentTime, d: v.duration, ended: v.ended, paused: v.paused }
  })
  log(`4 single-video repeats (ended=${loop.ended} paused=${loop.paused} t=${loop.t?.toFixed?.(2)}/${loop.d?.toFixed?.(2)})`, loop.ok)

  // 5. fullscreen enter/exit
  await page.getByRole("button", { name: "Enter fullscreen" }).click()
  await page.waitForTimeout(700)
  let fs = await page.evaluate(() => Boolean(document.fullscreenElement))
  log(`5 fullscreen enters`, fs)
  if (fs) {
    await page.getByRole("button", { name: "Exit fullscreen" }).click()
    await page.waitForTimeout(500)
    fs = await page.evaluate(() => !document.fullscreenElement)
    log(`5 fullscreen exits`, fs)
  }

  // 6. form edit does not restart playback
  const before = await frame.getAttribute("data-video-id")
  const t1 = await page.evaluate(() => document.querySelector("[data-playback] video")?.currentTime ?? -1)
  await page.getByRole("button", { name: "Premium" }).click()
  await page.waitForTimeout(900)
  const after = await frame.getAttribute("data-video-id")
  const t2 = await page.evaluate(() => document.querySelector("[data-playback] video")?.currentTime ?? -1)
  log(`6 form edit: same video, keeps position (${t1.toFixed?.(2)}→${t2.toFixed?.(2)})`, before === after && t2 >= t1 - 0.05 && t2 > t1)

  // 7. outside play/pause works
  await page.getByRole("button", { name: "Pause video" }).click()
  await page.waitForTimeout(500)
  const paused = await page.evaluate(() => document.querySelector("[data-playback] video")?.paused === true)
  await page.getByRole("button", { name: "Play video" }).click()
  await page.waitForTimeout(700)
  const resumed = await page.evaluate(() => document.querySelector("[data-playback] video")?.paused === false)
  log(`7 outside pause/resume`, paused && resumed)

  // 8. multi-temple: A → B on ENDED (both owned files)
  await page.getByRole("button", { name: /Back to Temples/ }).click()
  await page.waitForTimeout(700)
  await addTemple("Birla Mandir")
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await frame.waitFor({ state: "visible", timeout: 30000 })
  let vA = await frame.getAttribute("data-video-id")
  let vB = vA
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(400)
    vB = await frame.getAttribute("data-video-id")
    if (vB !== vA) break
  }
  log(`8 playlist A→B on ENDED (${vA?.replace("file:", "")} → ${vB?.replace("file:", "")})`, vB !== vA)
  log(`8 badge 1 of 2 + prev/next outside picture`, (await page.getByText("1 of 2").count()) > 0 || (await page.getByText("2 of 2").count()) > 0)

  // 9. mobile 390
  const p2 = await ctx.newPage()
  await p2.setViewportSize({ width: 390, height: 844 })
  await p2.goto("http://localhost:3100/plan", { waitUntil: "domcontentloaded" })
  const mobOk = await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)
  log(`9 mobile no overflow`, mobOk)
} catch (err) {
  out.push(`SCRIPT ERROR: ${String(err).slice(0, 400)}`)
} finally {
  console.log(out.join("\n"))
  await ctx.close() // flushes the hover-sweep recording
  await browser.close()
}
