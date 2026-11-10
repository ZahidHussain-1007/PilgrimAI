import { describe, expect, it, vi, beforeEach } from "vitest"
import { ConversationService } from "../../src/services/conversations/conversation.service"

const mockSupabase = {
  from: vi.fn(),
}

vi.mock("../../src/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

describe("ConversationService Unit Tests", () => {
  let conversationService: ConversationService

  beforeEach(() => {
    vi.clearAllMocks()
    conversationService = new ConversationService()
  })

  it("should create conversation and persist to Supabase", async () => {
    const mockQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "22222222-2222-2222-2222-222222222222",
          user_id: "user-123",
          title: "Pilgrimage Planning",
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const conv = await conversationService.createConversation("user-123", {
      title: "Pilgrimage Planning",
    })

    expect(conv.id).toBe("22222222-2222-2222-2222-222222222222")
    expect(conv.title).toBe("Pilgrimage Planning")
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        title: "Pilgrimage Planning",
      }),
    )
  })

  it("should pack sources and followUpQuestions into metadata when saving message", async () => {
    const mockMessageQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "33333333-3333-3333-3333-333333333333",
          conversation_id: "22222222-2222-2222-2222-222222222222",
          role: "assistant",
          content: "Welcome to Yadadri",
          metadata: {
            sources: [{ label: "Official Guide", href: "https://example.com" }],
            followUpQuestions: ["What are sevas?"],
            userId: "user-123",
          },
          created_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockSupabase.from.mockReturnValue(mockMessageQuery)

    const saved = await conversationService.addMessage(
      "22222222-2222-2222-2222-222222222222",
      {
        conversationId: "22222222-2222-2222-2222-222222222222",
        userId: "user-123",
        role: "assistant",
        content: "Welcome to Yadadri",
        sources: [{ label: "Official Guide", href: "https://example.com" }],
        followUpQuestions: ["What are sevas?"],
      },
    )

    expect(saved.id).toBe("33333333-3333-3333-3333-333333333333")
    expect(saved.sources).toBeDefined()
    expect(saved.sources![0].label).toBe("Official Guide")
    expect(mockMessageQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "22222222-2222-2222-2222-222222222222",
        role: "assistant",
        content: "Welcome to Yadadri",
        metadata: expect.objectContaining({
          userId: "user-123",
          sources: [{ label: "Official Guide", href: "https://example.com" }],
        }),
      }),
    )
  })

  it("should unpack metadata when listing messages", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "msg-1",
            conversation_id: "conv-1",
            role: "assistant",
            content: "Darshan is from 4 AM",
            metadata: {
              sources: [{ label: "Temple Site", href: "https://temple.gov" }],
              followUpQuestions: ["How to reach?"],
            },
            created_at: "2026-10-27T00:00:00Z",
          },
        ],
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const messages = await conversationService.listMessages("conv-1")
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe("Darshan is from 4 AM")
    expect(messages[0].sources?.[0].label).toBe("Temple Site")
    expect(messages[0].followUpQuestions?.[0]).toBe("How to reach?")
  })

  it("should throw error if listMessages fails", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "database offline" },
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    await expect(
      conversationService.listMessages("conv-1"),
    ).rejects.toThrow("Failed to list messages: database offline")
  })
})
