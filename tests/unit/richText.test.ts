import { describe, expect, it } from "vitest"
import { parseRichText } from "../../src/lib/richText"

describe("parseRichText", () => {
  it("keeps plain text as a single paragraph", () => {
    const blocks = parseRichText("Hello pilgrims.")
    expect(blocks).toEqual([
      { kind: "paragraph", tokens: [{ kind: "text", value: "Hello pilgrims." }] },
    ])
  })

  it("parses **bold** spans", () => {
    const blocks = parseRichText("**Sri Sanghi Temple** details")
    expect(blocks[0].kind).toBe("paragraph")
    if (blocks[0].kind !== "paragraph") return
    expect(blocks[0].tokens).toEqual([
      { kind: "bold", value: "Sri Sanghi Temple" },
      { kind: "text", value: " details" },
    ])
  })

  it("makes bare URLs clickable and strips trailing punctuation", () => {
    const blocks = parseRichText("See https://example.com/timings.")
    if (blocks[0].kind !== "paragraph") throw new Error("expected paragraph")
    const link = blocks[0].tokens.find((t) => t.kind === "link")
    expect(link).toEqual({
      kind: "link",
      value: "https://example.com/timings",
      href: "https://example.com/timings",
    })
    const last = blocks[0].tokens.at(-1)
    expect(last).toEqual({ kind: "text", value: "." })
  })

  it("groups consecutive bullet lines into one list", () => {
    const blocks = parseRichText("Intro\n- first item\n- second item\n\nAfter")
    expect(blocks.map((b) => b.kind)).toEqual([
      "paragraph",
      "list",
      "paragraph",
    ])
    const list = blocks[1]
    if (list.kind !== "list") throw new Error("expected list")
    expect(list.items).toHaveLength(2)
    expect(list.items[0][0]).toEqual({ kind: "text", value: "first item" })
  })

  it("handles bullets with bold content and • markers", () => {
    const blocks = parseRichText("• **Location:** Sanghi Nagar")
    if (blocks[0].kind !== "list") throw new Error("expected list")
    expect(blocks[0].items[0]).toEqual([
      { kind: "bold", value: "Location:" },
      { kind: "text", value: " Sanghi Nagar" },
    ])
  })

  it("never splits numbers glued to units (rendering keeps digits intact)", () => {
    const blocks = parseRichText("The route is 22.18 km and takes 32.71 minutes.")
    if (blocks[0].kind !== "paragraph") throw new Error("expected paragraph")
    const text = blocks[0].tokens
      .map((t) => (t.kind === "text" ? t.value : t.value))
      .join("")
    expect(text).toBe("The route is 22.18 km and takes 32.71 minutes.")
  })

  it("tolerates empty input", () => {
    expect(parseRichText("")).toEqual([])
    expect(parseRichText(undefined as unknown as string)).toEqual([])
  })
})
