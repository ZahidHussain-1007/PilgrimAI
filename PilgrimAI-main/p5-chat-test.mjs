import { chromium } from "playwright"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1568, height: 882 } })
const out = []
const log = (k, v) => out.push(`${v ? "PASS" : "FAIL"} ${k}`)
const CHAT_PANEL = 'div.rounded-\\[22px\\]:has(h2:text("Chat with PilgrimAI"))'
const starters = () => page.locator(`${CHAT_PANEL} div.flex-wrap button`)
const msgArea = page.locator(`${CHAT_PANEL} div.overflow-y-auto`)
const replyTexts = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("div.rounded-2xl")]
      .map((el) => el.textContent || "")
      .filter((t) => !t.startsWith("…")),
  )
try {
  await page.goto("http://localhost:3100/plan", { waitUntil: "domcontentloaded" })
  await page.locator("h2", { hasText: "Chat with PilgrimAI" }).waitFor({ state: "visible", timeout: 30000 })
  await page.waitForTimeout(800)

  // 1. empty chat → starter suggestions visible
  log("1 empty chat → starters visible", (await starters().count()) === 4)
  const hEmpty = await msgArea.evaluate((el) => el.offsetHeight)

  // 2. blank / whitespace input must NOT dismiss starters
  const input = page.locator(`${CHAT_PANEL} form input[placeholder*="Ask about"]`)
  await input.fill("   ")
  await input.press("Enter")
  await page.waitForTimeout(400)
  log("2 whitespace input keeps starters", (await starters().count()) === 4)

  // 3. suggestion click → one message, starters gone IMMEDIATELY (pre-reply)
  await page.getByRole("button", { name: "Temples of Lord Shiva" }).click()
  await page.waitForTimeout(300)
  const hiddenEarly = (await starters().count()) === 0
  const userBubbles = await page.locator(`${CHAT_PANEL} div.rounded-2xl.bg-\\[\\#b66a13\\]`).count()
  log("3 chip → starters unmount before reply + exactly one user bubble", hiddenEarly && userBubbles === 1)

  // 4. message area actually gained the freed space
  const hAfter = await msgArea.evaluate((el) => el.offsetHeight)
  log(`4 conversation area expanded (${hEmpty} → ${hAfter}px)`, hAfter >= hEmpty + 24)

  // 5. reply arrives with suggestion cards
  let replied = false
  for (let i = 0; i < 60; i++) {
    const texts = await replyTexts()
    replied = texts.some((x) => (x.includes("Vemulawada") || x.includes("Ramappa") || x.includes("Kaleshwara")) && x.length > 60)
    if (replied) break
    await page.waitForTimeout(700)
  }
  log("5 chip → real backend reply", replied)
  let cardBtns = 0
  for (let i = 0; i < 30; i++) {
    cardBtns = await page.locator(`${CHAT_PANEL} div[class*="border-t"] button:has-text("Add")`).count()
    if (cardBtns >= 2) break
    await page.waitForTimeout(600)
  }
  log(`6 suggestion cards with Add (${cardBtns})`, cardBtns >= 2)

  // 7. Add from the chat card → shared selection flips
  const cardAdd = page.locator(`${CHAT_PANEL} div[class*="border-t"] button:has-text("Add")`).first()
  if ((await cardAdd.count()) > 0) {
    await cardAdd.click()
    await page.waitForTimeout(500)
    log("7 Add from chat card works", (await page.locator(`${CHAT_PANEL} button:has-text("Added")`).count()) > 0)
  } else log("7 Add from chat card works", false)

  // 8. free-text question, starters stay hidden through loading + response
  await input.fill("one day trip near Hyderabad")
  await input.press("Enter")
  let replied2 = false
  for (let i = 0; i < 60; i++) {
    const texts = await replyTexts()
    replied2 = texts.filter((x) => x.includes("km") || x.includes("Hyderabad") || x.includes("day trip")).length >= 2
    if (replied2) break
    await page.waitForTimeout(700)
  }
  log("8 free-text answered + starters stay hidden", replied2 && (await starters().count()) === 0)

  // 9. no error banner
  log("9 no connection error shown", (await page.locator("text=could not reach PilgrimAI").count()) === 0)

  await page.screenshot({ path: "shots/p5-chat-after-1568x882.png" })

  // 10. reload → restored conversation, no starter flash
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.locator("h2", { hasText: "Chat with PilgrimAI" }).waitFor({ state: "visible", timeout: 30000 })
  await page.waitForTimeout(600)
  const restoredBubbles = await page.locator(`${CHAT_PANEL} div.rounded-2xl.bg-\\[\\#b66a13\\]`).count()
  log("10 restore: user bubble present + starters never shown", restoredBubbles >= 1 && (await starters().count()) === 0)

  // 11. explicit New chat → starters return
  await page.getByRole("button", { name: "New chat" }).click()
  await page.waitForTimeout(400)
  log("11 New chat → starters return + intro only", (await starters().count()) === 4 && restoredBubbles >= 1)

  // 12. no leftover starter space on mobile width
  await page.setViewportSize({ width: 420, height: 850 })
  await page.waitForTimeout(400)
  const inputVisible = await input.isVisible()
  log("12 mobile: input visible, starters back after reset", inputVisible && (await starters().count()) === 4)
} catch (e) {
  out.push(`SCRIPT ERROR: ${String(e).slice(0, 300)}`)
} finally {
  console.log(out.join("\n"))
  await browser.close()
}
