import { BadRequestError, ApiError } from "@/lib/api/errors"

export interface MultiAgentChatRequest {
  message: string
  session_id?: string
}

export interface MultiAgentEvidenceItem {
  source?: string
  provider?: string
  kind?: string
  name?: string
  text?: string
  url?: string
  role?: string
  [key: string]: unknown
}

export interface MultiAgentChatResponse {
  session_id: string
  category: string
  intent?: string
  reply: string
  clarification?: string | null
  status: "COMPLETED" | "DIRECT" | "EMERGENCY" | "NEEDS_CLARIFICATION" | "DEGRADED" | string
  evidence?: MultiAgentEvidenceItem[]
  budget?: Record<string, unknown> | null
}

export interface MultiAgentHealthResponse {
  status: "ok" | string
}

export class MultiAgentClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(baseUrl?: string, timeoutMs = 30000) {
    this.baseUrl = (baseUrl || process.env.MULTIAGENT_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "")
    this.timeoutMs = timeoutMs
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  async checkHealth(): Promise<{ isHealthy: boolean; status: string; detail?: string }> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
      clearTimeout(timeoutId)
      if (res.ok) {
        const data = (await res.json()) as MultiAgentHealthResponse
        return { isHealthy: data.status === "ok", status: data.status }
      }
      return { isHealthy: false, status: `HTTP_${res.status}` }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Service unreachable"
      return { isHealthy: false, status: "unreachable", detail: msg }
    }
  }

  async sendChat(message: string, sessionId?: string): Promise<MultiAgentChatResponse> {
    const trimmed = message.trim()
    if (!trimmed) {
      throw new BadRequestError("Message content cannot be empty.")
    }

    const payload: MultiAgentChatRequest = {
      message: trimmed,
      ...(sessionId ? { session_id: sessionId } : {}),
    }

    let res: Response
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      res = await fetch(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
        throw new ApiError(
          "Multi-agent AI service timed out while processing your request. Please try again.",
          504,
          "GATEWAY_TIMEOUT",
        )
      }
      throw new ApiError(
        "Multi-agent AI service is currently unavailable. Please verify the service is running and try again.",
        503,
        "SERVICE_UNAVAILABLE",
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      let errorDetail = ""
      try {
        const errorJson = await res.json()
        errorDetail = errorJson?.detail || errorJson?.error || ""
      } catch {
        // Non-JSON response body
      }

      if (res.status === 400 || res.status === 422) {
        throw new BadRequestError(errorDetail || "Invalid request to multi-agent AI service.")
      }
      if (res.status === 503) {
        throw new ApiError(
          errorDetail || "AI reasoning service is temporarily unavailable. Please try again later.",
          503,
          "SERVICE_UNAVAILABLE",
        )
      }
      throw new ApiError(
        "An unexpected error occurred while communicating with the AI service.",
        res.status >= 500 ? res.status : 502,
        "AI_SERVICE_ERROR",
      )
    }

    try {
      const data = (await res.json()) as MultiAgentChatResponse
      if (!data || typeof data.reply !== "string") {
        throw new Error("Invalid response format from multi-agent AI backend.")
      }
      return data
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err
      throw new ApiError(
        "Failed to parse response from multi-agent AI backend.",
        502,
        "BAD_GATEWAY",
      )
    }
  }
}

export const multiAgentClient = new MultiAgentClient()
