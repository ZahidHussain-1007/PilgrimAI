import { chromium } from "playwright"

const browser = await chromium.launch()
const out = []
const log = (k, v) => out.push(`${v ? "PASS" : "FAIL"} ${k}`)

async function openPlan(page) {
  await page.goto("http://localhost:3100/plan", { waitUntil: "domcontentloaded" })
  await page.locator("li", { hasText: "Sri Sanghi Temple" }).first().waitFor({ state: "visible", timeout: 30000 })
  await page.waitForTimeout(600)
}
async function addTemple(page, name) {
  const li = page.locator("li", { hasText: name }).first()
  const add = () => li.getByRole("button", { name: /^Add$/ }).click()
  await add()
  try {
    await li.getByRole("button", { name: /added/i }).waitFor({ state: "visible", timeout: 5000 })
  } catch {
    await page.waitForTimeout(400)
    await add() // hydration race → one retry
    await li.getByRole("button", { name: /added/i }).waitFor({ state: "visible", timeout: 10000 })
  }
}
async function continueToTrip(page) {
  await page.getByRole("button", { name: "Continue", exact: true }).scrollIntoViewIfNeeded()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.locator("[data-playback]").waitFor({ state: "visible", timeout: 30000 })
}
async function waitPlayback(page) {
  let state = "none"
  for (let i = 0; i < 50; i++) {
    state = await page.locator("[data-playback]").getAttribute("data-playback").catch(() => "?")
    if (["playing", "blocked", "empty", "error"].includes(state)) break
    await page.waitForTimeout(500)
  }
  return state
}

try {
  // ---------- A. single video: playback + clean frame ----------
  const page = await browser.newPage({ viewport: { width: 1568, height: 882 } })
  await openPlan(page)
  await addTemple(page, "Sri Sanghi Temple")
  await continueToTrip(page)
  const state = await waitPlayback(page)
  log(`A single-temple playback reached "${state}"`, state === "playing" || state === "blocked")

  const geo = await page.evaluate(() => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    }
    const vid = document.querySelector("[data-playback]")
    const form = document.querySelector("form")
    return {
      sidebar: r(document.querySelector(".sidebar")),
      video: r(vid),
      form: r(form),
      leftOfForm: vid && form ? vid.getBoundingClientRect().right <= form.getBoundingClientRect().left + 4 : false,
    }
  })
  log(`A video LEFT of form · video ${geo.video?.w}x${geo.video?.h}@${geo.video?.x},${geo.video?.y} · sidebar ${geo.sidebar?.w} · form w=${geo.form?.w}`, geo.leftOfForm && (geo.video?.w || 0) >= 640 && (geo.video?.w || 0) <= 740 && (geo.video?.h || 0) >= 330)

  // clean frame: no app badge / mute / title strip; only fullscreen in-frame
  const frameBtns = await page.locator("[data-playback] button").count()
  const badgeCount = await page.getByText("Temple Experience", { exact: true }).count()
  const muteCount = await page.getByRole("button", { name: /mute/i }).count()
  const fsBtn = await page.getByRole("button", { name: "Enter fullscreen" }).count()
  const watchLink = await page.getByText("Watch on YouTube").count()
  log(`A clean frame: no badge/mute/title, fullscreen only (in-frame buttons=${frameBtns})`, frameBtns === 1 && badgeCount === 0 && muteCount === 0 && fsBtn === 1 && watchLink > 0)

  // hover over picture must not add application controls
  await page.locator("[data-playback]").hover()
  await page.waitForTimeout(500)
  log(`A hover adds no application controls`, (await page.locator("[data-playback] button").count()) === 1)

  // fullscreen enter + escape exit
  await page.getByRole("button", { name: "Enter fullscreen" }).click()
  await page.waitForTimeout(900)
  const fsOn = await page.evaluate(() => Boolean(document.fullscreenElement))
  log(`A fullscreen enters`, fsOn)
  if (fsOn) {
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    let fsOff = await page.evaluate(() => !document.fullscreenElement)
    if (!fsOff) {
      // headless shell ignores Escape — the exit button must still work
      await page.getByRole("button", { name: "Exit fullscreen" }).click()
      await page.waitForTimeout(600)
      fsOff = await page.evaluate(() => !document.fullscreenElement)
    }
    log(`A fullscreen exits (escape or exit button)`, fsOff)
  } else {
    log(`A fullscreen exits (escape or exit button)`, false)
  }

  if (state === "blocked") {
    await page.getByRole("button", { name: "Play video" }).click()
    await page.waitForTimeout(4000)
    log(`A blocked → outside play action works`, (await waitPlayback(page)) === "playing")
  }
  // outside controls: play/pause present below picture
  log(`A outside play/pause control below picture`, (await page.locator("[data-player-controls]").count()) > 0 && (await page.getByRole("button", { name: /play video|pause video/i }).count()) > 0)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: "shots/p5-single-1568x882.png" })

  // ---------- B. validation + no video restart ----------
  await page.locator('select[aria-label="Adults"]').selectOption("5")
  await page.waitForTimeout(300)
  log(`B composition mismatch → alert + submit blocked`, (await page.getByRole("alert").count()) > 0 && (await page.getByRole("button", { name: "Plan My Trip" }).isDisabled()))
  await page.locator('select[aria-label="Adults"]').selectOption("2")
  await page.waitForTimeout(200)
  log(`B composition fixed → enabled`, !(await page.getByRole("button", { name: "Plan My Trip" }).isDisabled()))
  const vBefore = await page.locator("[data-video-id]").getAttribute("data-video-id")
  await page.getByRole("button", { name: "Premium" }).click()
  await page.waitForTimeout(900)
  const vAfter = await page.locator("[data-video-id]").getAttribute("data-video-id")
  log(`B form edits do not restart video`, vBefore === vAfter)

  // ---------- C. submit workflow ----------
  await page.locator('input[type="date"]').fill("2026-11-15")
  await page.getByRole("button", { name: "Plan My Trip" }).click()
  await page.waitForTimeout(5200)
  log(`C Plan My Trip → ready state`, (await page.getByText("Your trip is ready").count()) > 0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: "shots/p5-ready-1568x882.png" })

  // ---------- D. back preserves selection ----------
  await page.getByRole("button", { name: /Back to Temples/ }).click()
  await page.waitForTimeout(900)
  log(`D back → selection preserved`, (await page.getByText("1 temples selected").count()) > 0)

  // ---------- E. multi-temple playlist ----------
  await addTemple(page, "Sri Lakshmi Narasimha Swamy Temple")
  await addTemple(page, "Sri Ramalingeswara")
  await continueToTrip(page)
  await waitPlayback(page)
  log(`E 3-playable badge "1 of 3"`, (await page.getByText("1 of 3").count()) > 0)
  const idA = await page.locator("[data-video-id]").getAttribute("data-video-id")
  await page.getByRole("button", { name: "Next video" }).click()
  await page.waitForTimeout(4500)
  const idB = await page.locator("[data-video-id]").getAttribute("data-video-id")
  log(`E next advances video (${idA?.slice(0, 8)} → ${idB?.slice(0, 8)})`, Boolean(idA && idB && idA !== idB))
  log(`E info section shows active temple heading`, (await page.getByRole("heading", { name: /Lakshmi Narasimha/ }).count()) > 0)
  await page.getByRole("button", { name: "Previous video" }).click()
  await page.waitForTimeout(4000)
  log(`E previous returns to first`, (await page.locator("[data-video-id]").getAttribute("data-video-id")) === idA)
  log(`E other-temples cards (2) + section heading`, (await page.getByText("Other Selected Temples").count()) > 0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: "shots/p5-multi-1568x882.png" })

  // ---------- F. no-video temple ----------
  const p2 = await browser.newPage({ viewport: { width: 1568, height: 882 } })
  await openPlan(p2)
  await addTemple(p2, "Sri Raja Rajeshwara")
  await continueToTrip(p2)
  await waitPlayback(p2)
  log(`F no-video → empty state + details intact`, (await p2.locator('[data-playback="empty"]').count()) > 0 && (await p2.getByRole("heading", { name: /Raja Rajeshwara/ }).count()) > 0)
  await p2.evaluate(() => window.scrollTo(0, 0))
  await p2.screenshot({ path: "shots/p5-novideo-1568x882.png" })

  // ---------- G. languages ----------
  const p3 = await browser.newPage({ viewport: { width: 1568, height: 882 } })
  await openPlan(p3)
  await addTemple(p3, "Sri Sanghi Temple")
  await continueToTrip(p3)
  await p3.getByRole("button", { name: "తె" }).click()
  await p3.waitForTimeout(900)
  log(`G Telugu journey heading`, (await p3.getByText("మీ యాత్రను ప్లాన్ చేయండి").count()) > 0)
  await p3.screenshot({ path: "shots/p5-te-1568x882.png" })
  await p3.getByRole("button", { name: "हि" }).click()
  await p3.waitForTimeout(900)
  log(`G Hindi journey heading`, (await p3.getByText("अपनी यात्रा की योजना बनाएँ").count()) > 0)
  await p3.screenshot({ path: "shots/p5-hi-1568x882.png" })
  await p3.getByRole("button", { name: "EN" }).click().catch(() => {})

  // ---------- H. 1366 + mobile ----------
  const p4 = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await openPlan(p4)
  await addTemple(p4, "Sri Sanghi Temple")
  await continueToTrip(p4)
  await p4.waitForTimeout(1200)
  await p4.screenshot({ path: "shots/p5-1366x768.png" })
  log(`H 1366 no horizontal overflow`, !(await p4.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)))

  const p5 = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await p5.goto("http://localhost:3100/plan", { waitUntil: "domcontentloaded" })
  await p5.locator("li", { hasText: "Sri Sanghi Temple" }).first().waitFor({ state: "visible", timeout: 30000 })
  await p5.waitForTimeout(800)
  await addTemple(p5, "Sri Sanghi Temple")
  await p5.getByRole("button", { name: "Continue", exact: true }).scrollIntoViewIfNeeded()
  await p5.getByRole("button", { name: "Continue", exact: true }).click()
  await p5.locator("[data-playback]").waitFor({ state: "visible", timeout: 30000 })
  await p5.waitForTimeout(1000)
  await p5.screenshot({ path: "shots/p5-390x844.png" })
  const mob = await p5.evaluate(() => {
    const v = document.querySelector("[data-playback]")?.getBoundingClientRect()
    const f = document.querySelector("form")?.getBoundingClientRect()
    return {
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
      videoFirst: v && f ? f.top > v.bottom - 8 : false,
      videoW: v ? Math.round(v.width) : 0,
    }
  })
  log(`H mobile 390: no overflow, video first (w=${mob.videoW})`, mob.noOverflow && mob.videoFirst)
} catch (err) {
  out.push(`SCRIPT ERROR: ${String(err).slice(0, 400)}`)
} finally {
  console.log(out.join("\n"))
  await browser.close()
}
