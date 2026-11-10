import { describe, expect, it } from "vitest"
import { deriveFollowUps } from "../followUps"

describe("v18 deriveFollowUps (entity-specific next questions)", () => {
  it("names the discovered temple in all three questions", () => {
    const out = deriveFollowUps([
      { kind: "place", role: "origin", name: "Secunderabad, Hyderabad" },
      { kind: "temple_candidate", name: "Birla Mandir Hyderabad" },
    ] as never)
    expect(out).toHaveLength(3)
    expect(out.every((q) => q.includes("Birla Mandir Hyderabad"))).toBe(true)
    expect(out[0]).toContain("darshan timings")
  })

  it("skips the origin and uses the first real place/POI", () => {
    const out = deriveFollowUps([
      { kind: "place", role: "origin", name: "Hyderabad" },
      { kind: "poi", name: "Golconda Fort" },
    ] as never)
    expect(out).toHaveLength(3)
    expect(out.every((q) => q.includes("Golconda Fort"))).toBe(true)
    expect(out.some((q) => q.includes("Hyderabad"))).toBe(false)
  })

  it("returns nothing when evidence has no named entity", () => {
    expect(deriveFollowUps([])).toEqual([])
    expect(deriveFollowUps(undefined)).toEqual([])
    expect(
      deriveFollowUps([{ kind: "note", content: "empty" }] as never),
    ).toEqual([])
  })
})
