import { describe, expect, it, vi, beforeEach } from "vitest"
import { POST } from "../../src/app/api/chat/route"
import { getAuthContext } from "../../src/lib/auth/context"
import { conversationService } from "../../src/services/conversations/conversation.service"
import { aiService } from "../../src/services/ai/ai.service"
import { ApiError } from "../../src/lib/api/errors"

vi.mock("../../src/lib/auth/context", () => ({
  getAuthContext: vi.fn(),
}))

vi.mock("../../src/services/conversations/conversation.service", () => ({
  conversationService: {
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    addMessage: vi.fn(),
  },
}))

vi.mock("../../src/services/ai/ai.service", () => ({
  aiService: {
    generateResponse: vi.fn(),
  },
}))

describe("POST /api/chat Route Handler Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should reject empty or whitespace message with 400", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      isAuthenticated: true,
    })

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "   " }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it("should reject unauthenticated request specifying conversationId with 401", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: null,
      isAuthenticated: false,
    })

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "What are the timings?",
        conversationId: "conv-forbidden-123",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("should reject conversationId that does not belong to the authenticated user with 404", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", email: "user1@example.com" },
      isAuthenticated: true,
    })

    vi.mocked(conversationService.getConversation).mockResolvedValue(null)

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Tell me about Bhadrachalam",
        conversationId: "conv-other-user",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
    expect(conversationService.getConversation).toHaveBeenCalledWith(
      "conv-other-user",
      "user-1",
    )
  })

  it("should create conversation, persist both messages, and return AI response on new chat", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", email: "user1@example.com" },
      isAuthenticated: true,
    })

    vi.mocked(conversationService.createConversation).mockResolvedValue({
      id: "conv-new-uuid",
      userId: "user-1",
      title: "Tell me about Yadadri",
      createdAt: "2026-10-27T00:00:00Z",
      updatedAt: "2026-10-27T00:00:00Z",
    })

    vi.mocked(conversationService.addMessage).mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-new-uuid",
      role: "assistant",
      content: "Yadadri timings are 6:30 AM to 1:00 PM.",
      createdAt: "2026-10-27T00:00:00Z",
    })

    vi.mocked(aiService.generateResponse).mockResolvedValue({
      id: "msg-ai-1",
      conversationId: "conv-new-uuid",
      userId: "user-1",
      role: "assistant",
      content: "Yadadri timings are 6:30 AM to 1:00 PM.",
      sources: [{ label: "Official Portal", href: "https://yadadri.org" }],
      followUpQuestions: ["What are sevas?"],
      createdAt: "2026-10-27T00:00:00Z",
    })

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Tell me about Yadadri" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ title: "Tell me about Yadadri" }),
    )
    expect(conversationService.addMessage).toHaveBeenCalledTimes(2)
    expect(conversationService.addMessage).toHaveBeenNthCalledWith(
      1,
      "conv-new-uuid",
      expect.objectContaining({
        role: "user",
        content: "Tell me about Yadadri",
      }),
    )
    expect(conversationService.addMessage).toHaveBeenNthCalledWith(
      2,
      "conv-new-uuid",
      expect.objectContaining({
        role: "assistant",
        content: "Yadadri timings are 6:30 AM to 1:00 PM.",
      }),
    )

    expect(json.conversationId).toBe("conv-new-uuid")
    expect(json.content).toBe("Yadadri timings are 6:30 AM to 1:00 PM.")
    expect(json.sources).toHaveLength(1)
  })

  it("should reuse existing conversationId for follow-up message", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", email: "user1@example.com" },
      isAuthenticated: true,
    })

    vi.mocked(conversationService.getConversation).mockResolvedValue({
      conversation: {
        id: "conv-existing-123",
        userId: "user-1",
        title: "Yadadri Pilgrimage",
      },
      messages: [],
    })

    vi.mocked(conversationService.addMessage).mockResolvedValue({
      id: "msg-2",
      conversationId: "conv-existing-123",
      role: "assistant",
      content: "Special sevas include Suprabhata Seva at 6:00 AM.",
      createdAt: "2026-10-27T00:00:00Z",
    })

    vi.mocked(aiService.generateResponse).mockResolvedValue({
      id: "msg-ai-2",
      conversationId: "conv-existing-123",
      userId: "user-1",
      role: "assistant",
      content: "Special sevas include Suprabhata Seva at 6:00 AM.",
      createdAt: "2026-10-27T00:00:00Z",
    })

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "What are the special sevas?",
        conversationId: "conv-existing-123",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(conversationService.createConversation).not.toHaveBeenCalled()
    expect(aiService.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-existing-123",
        message: "What are the special sevas?",
      }),
    )
  })

  it("should return controlled 503 error when multiagent AI service is unavailable", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "user-1", email: "user1@example.com" },
      isAuthenticated: true,
    })

    vi.mocked(conversationService.createConversation).mockResolvedValue({
      id: "conv-err",
      userId: "user-1",
      title: "Plan visit",
    })

    vi.mocked(aiService.generateResponse).mockRejectedValue(
      new ApiError(
        "Multi-agent AI service is currently unavailable. Please verify the service is running and try again.",
        503,
        "SERVICE_UNAVAILABLE",
      ),
    )

    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Plan visit" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.code).toBe("SERVICE_UNAVAILABLE")
    expect(json.error).toContain("Multi-agent AI service is currently unavailable")
  })
})
