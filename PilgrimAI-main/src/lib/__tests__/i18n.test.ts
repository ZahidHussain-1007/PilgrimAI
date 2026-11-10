import { describe, expect, it } from "vitest"
import { I18N_LANGUAGES, translate } from "../i18n"

const REQUIRED = [
  "nav.home", "nav.plan", "nav.trips", "nav.itineraries", "nav.history",
  "landing.titleBefore", "landing.titleAccent", "landing.sub", "landing.cta",
  "landing.step1Title", "landing.step2Title", "landing.step3Title",
  "landing.watch", "chat.titleBegin", "chat.titleResume", "chat.sub",
  "chat.placeholder", "lang.label",
]

describe("v19.1 i18n dictionary", () => {
  it("every language covers every required key", () => {
    for (const lang of I18N_LANGUAGES) {
      for (const key of REQUIRED) {
        const value = translate(lang, key)
        expect(value, `${lang}:${key}`).toBeTruthy()
        expect(value, `${lang}:${key}`).not.toBe(key)
      }
    }
  })

  it("telugu and hindi actually differ from english", () => {
    expect(translate("te", "landing.cta")).not.toBe(translate("en", "landing.cta"))
    expect(translate("hi", "chat.titleBegin")).not.toBe(translate("en", "chat.titleBegin"))
    expect(translate("te", "nav.plan")).toContain("ప్రయాణం")
  })

  it("falls back to english for unknown keys/langs", () => {
    expect(translate("en", "nope.key")).toBe("nope.key")
    expect(translate("xx" as never, "nav.home")).toBe("Home")
  })
})
