import { describe, expect, it } from "vitest"
import { LANGUAGE_OPTIONS } from "../prefs"

describe("v19 language prefs", () => {
  it("offers EN / తె / हि chips", () => {
    expect(LANGUAGE_OPTIONS.map((o) => o.code)).toEqual(["en", "te", "hi"])
    expect(LANGUAGE_OPTIONS[1].label).toBe("తె")
    expect(LANGUAGE_OPTIONS[2].label).toBe("हि")
  })
})
