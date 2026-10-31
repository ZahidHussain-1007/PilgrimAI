import { describe, expect, it } from "vitest"
import { validateCreateMessageInput } from "../validation"

describe("v17 anonymous session (history continuity)", () => {
  it("accepts a sessionId and keeps it in the payload", () => {
    const parsed = validateCreateMessageInput({
      content: "hello again",
      sessionId: "sess-abc-123",
    })
    expect(parsed.sessionId).toBe("sess-abc-123")
  })

  it("leaves sessionId undefined when absent (signed-in path)", () => {
    const parsed = validateCreateMessageInput({ content: "hi" })
    expect(parsed.sessionId).toBeUndefined()
  })

  it("rejects an overlong sessionId", () => {
    expect(() =>
      validateCreateMessageInput({ content: "hi", sessionId: "x".repeat(101) }),
    ).toThrow()
  })
})
