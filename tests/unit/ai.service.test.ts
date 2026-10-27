import { describe, expect, it, vi, beforeEach } from "vitest"
import { AiService } from "../../src/services/ai/ai.service"
import { MultiAgentClient, type MultiAgentChatResponse } from "../../src/services/ai/multiagent.client"
import { ApiError, BadRequestError } from "../../src/lib/api/errors"

describe("AiService & MultiAgent Integration Unit Tests", () => {
  let mockClient: MultiAgentClient
  let aiService: AiService

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.MULTIAGENT_ENABLE_FALLBACK
    delete process.env.MULTIAGENT_FALLBACK_ON_ERROR

    mockClient = new MultiAgentClient("http://127.0.0.1:8000")
    aiService = new AiService(mockClient)
  })

  it("should forward message and conversationId to multiagent backend and map reply", async () => {
    const mockResponse: MultiAgentChatResponse = {
      session_id: "conv-123",
      category: "temple_info",
      intent: "temple_info",
      reply: "Yadadri Sri Lakshmi Narasimha Swamy Temple darshan timings are 6:30 AM to 1:00 PM.",
      clarification: null,
      status: "COMPLETED",
      evidence: [
        {
          source: "temple_rag",
          name: "Yadadri Devastanam",
          url: "https://telanganatourism.gov.in/temples/yadadri",
          text: "Darshan timings are 6:30 AM to 1:00 PM.",
        },
      ],
      budget: null,
    }

    vi.spyOn(mockClient, "sendChat").mockResolvedValue(mockResponse)

    const result = await aiService.generateResponse({
      message: "What are Yadadri timings?",
      conversationId: "conv-123",
      userId: "user-abc",
    })

    expect(mockClient.sendChat).toHaveBeenCalledWith("What are Yadadri timings?", "conv-123")
    expect(result.role).toBe("assistant")
    expect(result.content).toBe(mockResponse.reply)
    expect(result.conversationId).toBe("conv-123")
    expect(result.userId).toBe("user-abc")
    expect(result.sources).toEqual([
      {
        label: "Yadadri Devastanam",
        href: "https://telanganatourism.gov.in/temples/yadadri",
      },
    ])
    expect(result.followUpQuestions).toBeDefined()
    expect(result.followUpQuestions?.length).toBeGreaterThan(0)
  })

  it("should map travel evidence and deep links into message sources", async () => {
    const mockResponse: MultiAgentChatResponse = {
      session_id: "conv-travel-1",
      category: "travel",
      reply: "Driving distance from Hyderabad to Yadadri is 62 km (approx 1 hr 20 min).",
      status: "COMPLETED",
      evidence: [
        {
          source: "routing",
          provider: "OSRM",
          name: "Hyderabad to Yadadri Route",
          url: "https://www.google.com/maps/dir/?api=1&origin=Hyderabad&destination=Yadadri",
        },
        {
          source: "transit",
          provider: "TSRTC",
          name: "TSRTC Yadadri Express",
          url: "https://www.redbus.in/",
        },
      ],
    }

    vi.spyOn(mockClient, "sendChat").mockResolvedValue(mockResponse)

    const result = await aiService.generateResponse({
      message: "How do I reach Yadadri from Hyderabad?",
      conversationId: "conv-travel-1",
    })

    expect(result.sources).toHaveLength(2)
    expect(result.sources?.[0]).toEqual({
      label: "Hyderabad to Yadadri Route",
      href: "https://www.google.com/maps/dir/?api=1&origin=Hyderabad&destination=Yadadri",
    })
    expect(result.sources?.[1]).toEqual({
      label: "TSRTC Yadadri Express",
      href: "https://www.redbus.in/",
    })
  })

  it("should handle clarification status by setting clarification prompt as follow-up question", async () => {
    const mockResponse: MultiAgentChatResponse = {
      session_id: "conv-clarify",
      category: "travel",
      reply: "Did you mean Yadagirigutta (Yadadri) or another destination?",
      clarification: "Did you mean Yadagirigutta (Yadadri) or another destination?",
      status: "NEEDS_CLARIFICATION",
      evidence: [],
    }

    vi.spyOn(mockClient, "sendChat").mockResolvedValue(mockResponse)

    const result = await aiService.generateResponse({
      message: "route to yadadri",
      conversationId: "conv-clarify",
    })

    expect(result.content).toContain("Did you mean")
    expect(result.followUpQuestions).toEqual([
      "Did you mean Yadagirigutta (Yadadri) or another destination?",
    ])
  })

  it("should throw a controlled 503 ApiError when multiagent service is unavailable", async () => {
    vi.spyOn(mockClient, "sendChat").mockRejectedValue(
      new ApiError(
        "Multi-agent AI service is currently unavailable. Please verify the service is running and try again.",
        503,
        "SERVICE_UNAVAILABLE",
      ),
    )

    await expect(
      aiService.generateResponse({
        message: "Hello",
        conversationId: "conv-fail",
      }),
    ).rejects.toThrow(ApiError)

    try {
      await aiService.generateResponse({
        message: "Hello",
        conversationId: "conv-fail",
      })
    } catch (err) {
      expect((err as ApiError).status).toBe(503)
      expect((err as ApiError).code).toBe("SERVICE_UNAVAILABLE")
      expect((err as ApiError).message).toContain("Multi-agent AI service is currently unavailable")
    }
  })

  it("should throw a controlled 504 ApiError when multiagent service times out", async () => {
    vi.spyOn(mockClient, "sendChat").mockRejectedValue(
      new ApiError(
        "Multi-agent AI service timed out while processing your request. Please try again.",
        504,
        "GATEWAY_TIMEOUT",
      ),
    )

    await expect(
      aiService.generateResponse({
        message: "Plan an intricate 5-day tour",
        conversationId: "conv-timeout",
      }),
    ).rejects.toMatchObject({
      status: 504,
      code: "GATEWAY_TIMEOUT",
    })
  })

  it("should support fallback mode when MULTIAGENT_ENABLE_FALLBACK is set to true", async () => {
    process.env.MULTIAGENT_ENABLE_FALLBACK = "true"

    const result = await aiService.generateResponse({
      message: "What are the darshan timings for Yadadri?",
      conversationId: "conv-fallback",
    })

    expect(result.role).toBe("assistant")
    expect(result.content).toContain("Lakshmi Narasimha Swamy")
    expect(result.sources).toBeDefined()
    expect(result.sources!.length).toBeGreaterThan(0)
  })

  it("should reject empty messages in client sendChat", async () => {
    const client = new MultiAgentClient()
    await expect(client.sendChat("   ")).rejects.toThrow(BadRequestError)
  })
})
