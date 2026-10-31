import { describe, it, expect } from "vitest"
import { safeNextPath } from "@/lib/authRedirect"
import {
  validateCreateItineraryInput,
  validateCreateItineraryItemInput,
} from "@/lib/validation"
import { parseRichText } from "@/lib/richText"

describe("S01 — OAuth callback next must stay same-origin", () => {
  it("keeps safe relative paths", () => {
    expect(safeNextPath("/chat")).toBe("/chat")
    expect(safeNextPath("/trips/123?tab=plan")).toBe("/trips/123?tab=plan")
    expect(safeNextPath(null)).toBe("/chat")
  })

  it("blocks open redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/chat")
    expect(safeNextPath("//evil.example")).toBe("/chat")
    expect(safeNextPath("/\\evil.example")).toBe("/chat")
    expect(safeNextPath("@evil.example")).toBe("/chat")
    expect(safeNextPath("/\\r\\n//evil.example")).toBe("/chat")
  })
})

describe("C01/C02 — itinerary validation keeps days, dayNumber, location", () => {
  it("retains nested days and stamps dayNumber on activities", () => {
    const input = validateCreateItineraryInput({
      title: "Hyderabad → Kondagattu → Vemulawada",
      estimatedCost: 4200,
      days: [
        {
          label: "Day 1",
          activities: [
            {
              title: "Kondagattu Anjaneya Swamy temple darshan",
              location: "Karimnagar",
              estimatedCost: 0,
            },
          ],
        },
        {
          label: "Day 2",
          activities: [{ title: "Vemulawada Rajarajeshwara temple" }],
        },
      ],
    })
    expect(input.days).toHaveLength(2)
    expect(input.days?.[0].activities?.[0].title).toContain("Kondagattu")
    expect(input.days?.[0].activities?.[0].dayNumber).toBe(1)
    expect(input.days?.[0].activities?.[0].location).toBe("Karimnagar")
    expect(input.days?.[1].activities?.[0].dayNumber).toBe(2)
  })

  it("keeps item dayNumber and location", () => {
    const item = validateCreateItineraryItemInput({
      title: "Breakfast stop",
      dayNumber: 2,
      location: "Vemulawada",
      estimatedCost: 0,
    })
    expect(item.dayNumber).toBe(2)
    expect(item.location).toBe("Vemulawada")
  })
})

describe("C24 — richText URL parsing keeps apostrophes", () => {
  it("links a Wikipedia URL with underscores (and one with an apostrophe)", () => {
    const wiki = parseRichText(
      "See https://en.wikipedia.org/wiki/Vemulawada_Raja_Rajeshwara_Temple for history.",
    )
    const wikiTokens = wiki.flatMap((b) => (b.kind === "paragraph" ? b.tokens : []))
    const wikiLink = wikiTokens.find((t) => t.kind === "link")
    expect(wikiLink).toBeTruthy()
    expect((wikiLink as { href: string }).href).toContain("Vemulawada_Raja")

    const quoted = parseRichText(
      "Docs: https://example.org/wiki/It's_here now",
    )
    const quotedTokens = quoted.flatMap((b) => (b.kind === "paragraph" ? b.tokens : []))
    const quotedLink = quotedTokens.find((t) => t.kind === "link")
    expect(quotedLink).toBeTruthy()
    expect((quotedLink as { href: string }).href).toContain("It's_here")
  })
})

describe("N01 — nested validation rejects malformed input", () => {
  it("rejects a non-array activities object instead of emptying it", () => {
    expect(() =>
      validateCreateItineraryInput({
        title: "Trip",
        days: [{ label: "Day 1", activities: { title: "orphan" } }],
      }),
    ).toThrow()
  })

  it("rejects fractional day numbers on items", () => {
    expect(() =>
      validateCreateItineraryItemInput({ title: "Walk", dayNumber: 1.5 }),
    ).toThrow()
  })

  it("rejects oversized days (41 activities in one day)", () => {
    expect(() =>
      validateCreateItineraryInput({
        title: "Trip",
        days: [
          {
            label: "Day 1",
            activities: Array.from({ length: 41 }, (_, i) => ({
              title: `Act ${i}`,
            })),
          },
        ],
      }),
    ).toThrow()
  })

  it("still accepts a normal two-day input", () => {
    const input = validateCreateItineraryInput({
      title: "Family trip",
      days: [
        { label: "Day 1", activities: [{ title: "Kondagattu" }] },
        { label: "Day 2", activities: [{ title: "Vemulawada" }] },
      ],
    })
    expect(input.days).toHaveLength(2)
    expect(input.days?.[1].activities?.[0].dayNumber).toBe(2)
  })
})
