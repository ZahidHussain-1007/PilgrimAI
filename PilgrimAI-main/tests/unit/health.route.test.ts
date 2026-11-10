import { describe, expect, it, vi, beforeEach } from "vitest"
import { GET } from "../../src/app/api/health/route"
import { multiAgentClient } from "../../src/services/ai/multiagent.client"

vi.mock("../../src/services/ai/multiagent.client", () => ({
  multiAgentClient: {
    checkHealth: vi.fn(),
  },
}))

describe("GET /api/health Route Handler Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return ok status when multiagent backend is healthy", async () => {
    vi.mocked(multiAgentClient.checkHealth).mockResolvedValue({
      isHealthy: true,
      status: "ok",
    })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe("ok")
    expect(data.services.api).toBe("ok")
    expect(data.services.multiagent.healthy).toBe(true)
    expect(data.services.multiagent.status).toBe("ok")
  })

  it("should return degraded status when multiagent backend is unreachable", async () => {
    vi.mocked(multiAgentClient.checkHealth).mockResolvedValue({
      isHealthy: false,
      status: "unreachable",
      detail: "Connection refused",
    })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe("degraded")
    expect(data.services.api).toBe("ok")
    expect(data.services.multiagent.healthy).toBe(false)
    expect(data.services.multiagent.status).toBe("unreachable")
  })
})
