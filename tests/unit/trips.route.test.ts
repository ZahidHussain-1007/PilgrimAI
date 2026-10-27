import { describe, expect, it, vi, beforeEach } from "vitest"
import { POST } from "../../src/app/api/trips/route"
import { tripService } from "../../src/services/trips/trip.service"
import { requireAuthContext } from "../../src/lib/auth/require-context"
import { UnauthorizedError } from "../../src/lib/api/errors"

vi.mock("../../src/lib/auth/require-context", () => ({
  requireAuthContext: vi.fn(),
}))

vi.mock("../../src/services/trips/trip.service", () => ({
  tripService: {
    createTrip: vi.fn(),
  },
}))

describe("POST /api/trips Route Handler Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should supply valid non-null empty preferences when omitted from request body", async () => {
    vi.mocked(requireAuthContext).mockResolvedValue({
      user: {
        id: "auth-user-456",
        email: "seeker@pilgrim.ai",
      },
      isAuthenticated: true,
    })

    vi.mocked(tripService.createTrip).mockResolvedValue({
      id: "trip-uuid-1",
      userId: "auth-user-456",
      title: "Somnath Pilgrimage",
      preferences: [],
      status: "planning",
      createdAt: "2026-10-27T00:00:00Z",
      updatedAt: "2026-10-27T00:00:00Z",
    })

    const request = new Request("http://localhost:3000/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Somnath Pilgrimage",
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(tripService.createTrip).toHaveBeenCalledWith(
      "auth-user-456",
      expect.objectContaining({
        title: "Somnath Pilgrimage",
        preferences: [],
      }),
    )
    expect(json.preferences).toEqual([])
  })

  it("should preserve explicitly supplied preferences in request body", async () => {
    vi.mocked(requireAuthContext).mockResolvedValue({
      user: {
        id: "auth-user-456",
        email: "seeker@pilgrim.ai",
      },
      isAuthenticated: true,
    })

    const userPrefs = ["Evening Aarti", "Nearby Prasad Center"]
    vi.mocked(tripService.createTrip).mockResolvedValue({
      id: "trip-uuid-2",
      userId: "auth-user-456",
      title: "Varanasi Journey",
      preferences: userPrefs,
      status: "planning",
      createdAt: "2026-10-27T00:00:00Z",
      updatedAt: "2026-10-27T00:00:00Z",
    })

    const request = new Request("http://localhost:3000/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Varanasi Journey",
        preferences: userPrefs,
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(tripService.createTrip).toHaveBeenCalledWith(
      "auth-user-456",
      expect.objectContaining({
        title: "Varanasi Journey",
        preferences: userPrefs,
      }),
    )
    expect(json.preferences).toEqual(userPrefs)
  })

  it("should reject unauthenticated trip creation attempts", async () => {
    vi.mocked(requireAuthContext).mockRejectedValue(
      new UnauthorizedError("Authentication required"),
    )

    const request = new Request("http://localhost:3000/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Unauthorized Journey",
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
    expect(tripService.createTrip).not.toHaveBeenCalled()
  })
})
