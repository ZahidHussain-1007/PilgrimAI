import { chromium } from "playwright"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1568, height: 882 } })
const out = []
const log = (k, v) => out.push(`${v ? "PASS" : "FAIL"} ${k}`)
const CHAT = 'div.rounded-\\[22px\\]:has(h2:text("Chat with PilgrimAI"))'
const panel = page.locator(CHAT)
const contBtns = page.getByRole("button", { name: "Continue", exact: true })
const msgArea = page.locator(`${CHAT} div.overflow-y-auto`)
const pageScroll = () => page.evaluate(() => document.querySelector(".page-content")?.scrollTop ?? -1)
try {
  // fresh state
  await page.goto("http://localhost:3100/plan", { waitUntil: "domcontentloaded" })
  await page.evaluate(() => { sessionStorage.clear(); localStorage.removeItem("pilgrim:temple_session_id") })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.locator("h2", { hasText: "Chat with PilgrimAI" }).waitFor({ state: "visible", timeout: 30000 })
  await page.waitForTimeout(600)

  // 1. empty chat: bounded panel height baseline
  const hEmpty = await panel.evaluate((el) => el.offsetHeight)
  log(`1 empty-chat panel height = ${hEmpty}px (bounded 380..560)`, hEmpty >= 380 && hEmpty <= 560)

  // 2. long conversation (40 msgs) → outer height unchanged, internal scroll
  const long = []
  for (let i = 0; i < 40; i++) {
    if (i % 2 === 0) long.push({ id: i + 1, role: "user", text: `Question number ${i} about temples near Hyderabad` })
    else long.push({ id: i + 1, role: "assistant", text: `Answer ${i}: Sri Raja Rajeshwara Swamy Devasthanam – Vemulawada. Sri Kaleshwara Mukteswara Swamy Devasthanam – Kaleshwaram. Ramappa Temple – Warangal.`, matchIds: ["T0003"] })
  }
  await page.evaluate((msgs) => sessionStorage.setItem("pilgrim:temple_chat_state", JSON.stringify(msgs)), long)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.locator("h2", { hasText: "Chat with PilgrimAI" }).waitFor({ state: "visible", timeout: 30000 })
  await page.waitForTimeout(500)
  const hLong = await panel.evaluate((el) => el.offsetHeight)
  const internal = await msgArea.evaluate((el) => el.scrollHeight > el.clientHeight + 50)
  log(`2 long conv: outer ${hEmpty} → ${hLong}px + internal scroll`, Math.abs(hLong - hEmpty) <= 2 && internal)

  // 3. starters hidden in restored thread (earlier spec preserved)
  log("3 restored thread keeps starters hidden", (await page.locator(`${CHAT} div.flex-wrap button`).count()) === 0)

  // 4. top toolbar: disabled at 0 with hint; bottom too
  const topBtn = contBtns.first()
  const countText = page.locator("text=/\\d+ temples selected/").first()
  const disabled0 = await contBtns.evaluateAll((els) => els.length === 2 && els.every((b) => b.disabled))
  const hint0 = await page.locator("text=Select at least one temple to continue.").count()
  log("4 zero selection → both Continue disabled + hint", disabled0 && hint0 >= 1 && (await countText.textContent())?.includes("0"))

  // 5. add from Browse list → both enable immediately, count updates
  await page.locator('div:has(h2:text("Browse Temples")) button:text-is("Add")').first().click()
  await page.waitForTimeout(300)
  const disabled1 = await contBtns.evaluateAll((els) => els.length === 2 && els.some((b) => !b.disabled))
  const enabledBoth = await contBtns.evaluateAll((els) => els.length === 2 && els.every((b) => !b.disabled))
  log(`5 list Add → count "${await countText.textContent()}" both enabled`, disabled1 && enabledBoth && (await countText.textContent())?.includes("1"))

  // 6. add a second temple (different row) → count 2, no dup
  await page.locator('div:has(h2:text("Browse Temples")) button:text-is("Add")').nth(1).click()
  await page.waitForTimeout(300)
  const chips2 = await page.locator('span:has(button[aria-label*="Remove"])').count()
  log(`6 second add → count "${await countText.textContent()}" chips=${chips2}`, (await countText.textContent())?.includes("2") && chips2 === 2)

  // 7. add from a chat recommendation card → count updates (shared state)
  const input = page.locator(`${CHAT} form input[placeholder*="Ask about"]`)
  await input.fill("temples for shiva darshan")
  await input.press("Enter")
  let cardReady = false
  for (let i = 0; i < 60; i++) {
    cardReady = (await page.locator(`${CHAT} div[class*="border-t"] button:text-is("Add")`).count()) >= 1
    if (cardReady) break
    await page.waitForTimeout(700)
  }
  if (cardReady) {
    const before = await countText.textContent()
    await page.locator(`${CHAT} div[class*="border-t"] button:text-is("Add")`).first().click()
    await page.waitForTimeout(300)
    const after = await countText.textContent()
    const addedInList = await page.locator('button:has-text("Added")').count()
    log(`7 chat card add: "${before}" → "${after}"`, before !== after || addedInList >= 2)
  } else log("7 chat card add: (no card found — LLM too slow)", false)

  // 8. remove all via bottom chips → both disable again
  let guard = 0
  while ((await page.locator('button[aria-label*="Remove"]').count()) > 0 && guard++ < 6) {
    await page.locator('button[aria-label*="Remove"]').first().click()
    await page.waitForTimeout(200)
  }
  const disabledAgain = await contBtns.evaluateAll((els) => els.length === 2 && els.every((b) => b.disabled))
  log("8 remove all → both disabled + hint back", disabledAgain && (await page.locator("text=Select at least one temple to continue.").count()) >= 1)

  // 9. sending a message does not scroll the page container
  const scrollBefore = await pageScroll()
  await input.fill("one day trip")
  await input.press("Enter")
  await page.waitForTimeout(400)
  const scrollAfter = await pageScroll()
  log(`9 send does not scroll page (${scrollBefore} → ${scrollAfter})`, Math.abs(scrollBefore - scrollAfter) <= 2)

  // 10. reader scrolled up → next reply does not steal position
  for (let i = 0; i < 60; i++) { // wait reply1
    const n = await page.locator(`${CHAT} div.rounded-2xl`).count()
    if (n >= 42) break
    await page.waitForTimeout(700)
  }
  await msgArea.evaluate((el) => { el.scrollTop = 0 })
  await input.fill("temples near secunderabad")
  await input.press("Enter")
  for (let i = 0; i < 60; i++) { // wait reply2
    const n = await page.locator(`${CHAT} div.rounded-2xl`).count()
    if (n >= 44) break
    await page.waitForTimeout(700)
  }
  await page.waitForTimeout(500)
  const posAfter = await msgArea.evaluate((el) => el.scrollTop)
  log(`10 scrolled-up reader keeps position (scrollTop=${posAfter})`, posAfter < 120)

  // 11. reselect + both buttons reach the SAME trip view; back preserves selection
  await page.locator('div:has(h2:text("Browse Temples")) button:text-is("Add")').first().click()
  await page.waitForTimeout(300)
  await contBtns.first().click() // top
  await page.locator('button:has-text("Back to Temples")').waitFor({ state: "visible", timeout: 10000 })
  await page.locator('button:has-text("Back to Temples")').click()
  await page.waitForTimeout(400)
  const keptAfterBack = (await countText.textContent())?.includes("1")
  await contBtns.nth(1).click() // bottom
  await page.locator('button:has-text("Back to Temples")').waitFor({ state: "visible", timeout: 10000 })
  await page.locator('button:has-text("Back to Temples")').click()
  await page.waitForTimeout(400)
  const keptAfterBack2 = (await countText.textContent())?.includes("1")
  log("11 both Continue → same trip view; selection preserved on back", keptAfterBack && keptAfterBack2)

  // 12. New chat must NOT clear selected temples
  await page.getByRole("button", { name: "New chat" }).click()
  await page.waitForTimeout(400)
  const selAfterNew = (await countText.textContent())?.includes("1")
  const startersBack = (await page.locator(`${CHAT} div.flex-wrap button`).count()) === 4
  log("12 New chat → starters return, selection untouched", selAfterNew && startersBack)

  // 13. sticky toolbar sits below heading, visible without scrolling to bottom
  const toolbarTop = await page.locator("div.sticky").first().evaluate((el) => el.getBoundingClientRect().top)
  log(`13 toolbar near top (top=${Math.round(toolbarTop)}px)`, toolbarTop > 0 && toolbarTop < 400)

  // screenshot: long conversation bounded + toolbar (restore long state again)
  await page.evaluate((msgs) => sessionStorage.setItem("pilgrim:temple_chat_state", JSON.stringify(msgs)), long)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.locator("h2", { hasText: "Chat with PilgrimAI" }).waitFor({ state: "visible", timeout: 30000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: "shots/p5-chat-bounded-after.png" })

  // 14. mobile stays usable
  await page.setViewportSize({ width: 420, height: 850 })
  await page.waitForTimeout(400)
  const mobInput = await page.locator(`${CHAT} form input`).isVisible()
  const mobToolbar = await page.locator("div.sticky button").first().isVisible()
  log("14 mobile: toolbar + composer visible", mobInput && mobToolbar)
} catch (e) {
  out.push(`SCRIPT ERROR: ${String(e).slice(0, 400)}`)
} finally {
  console.log(out.join("\n"))
  await browser.close()
}
