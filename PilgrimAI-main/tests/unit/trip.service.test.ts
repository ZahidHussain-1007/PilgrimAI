import { describe, expect, it, vi, beforeEach } from "vitest"
import { TripService } from "../../src/services/trips/trip.service"
import { NotFoundError } from "../../src/lib/api/errors"

const mockSupabase = {
  from: vi.fn(),
}

vi.mock("../../src/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

vi.mock("../../src/services/itineraries/itinerary.service", () => ({
  itineraryService: {
    getItineraryByTripId: vi.fn().mockResolvedValue({
      id: "itin-1",
      title: "Sample Itinerary",
      days: [],
    }),
  },
}))

describe("TripService Unit Tests", () => {
  let tripService: TripService

  beforeEach(() => {
    vi.clearAllMocks()
    tripService = new TripService()
  })

  it("should list trips mapped from live database columns including travelers", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "00000000-0000-0000-0000-000000000001",
            user_id: "user-123",
            title: "Tirupati Pilgrimage",
            travelers: 4,
            budget: 12000,
            status: "planning",
            created_at: "2026-10-27T00:00:00Z",
            updated_at: "2026-10-27T00:00:00Z",
          },
        ],
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const trips = await tripService.listTrips("user-123")
    expect(trips).toHaveLength(1)
    expect(trips[0].id).toBe("00000000-0000-0000-0000-000000000001")
    expect(trips[0].travellers).toBe(4)
    expect(trips[0].title).toBe("Tirupati Pilgrimage")
  })

  it("should throw a visible error when Supabase fails instead of falling back to memory", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "connection refused" },
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    await expect(tripService.listTrips("user-123")).rejects.toThrow(
      "Failed to list trips: connection refused",
    )
  })

  it("should create a trip with a valid UUID and travelers column", async () => {
    const mockQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: "user-123",
          title: "Yadadri Journey",
          travelers: 2,
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const result = await tripService.createTrip("user-123", {
      title: "Yadadri Journey",
      travellers: 2,
    })

    expect(result.id).toBe("11111111-1111-1111-1111-111111111111")
    expect(result.travellers).toBe(2)
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        title: "Yadadri Journey",
        travelers: 2,
        preferences: [],
      }),
    )
  })

  it("should supply a valid non-null empty array when preferences are omitted", async () => {
    const mockQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "22222222-2222-2222-2222-222222222222",
          user_id: "user-123",
          title: "Varanasi Yatra",
          preferences: [],
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const result = await tripService.createTrip("user-123", {
      title: "Varanasi Yatra",
    })

    expect(result.preferences).toEqual([])
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        title: "Varanasi Yatra",
        preferences: [],
      }),
    )
    // Explicitly verify preferences is not null
    const insertPayload = mockQuery.insert.mock.calls[0][0]
    expect(insertPayload.preferences).not.toBeNull()
    expect(Array.isArray(insertPayload.preferences)).toBe(true)
  })

  it("should preserve explicitly supplied preferences when creating a trip", async () => {
    const suppliedPreferences = ["Suprabhata Seva", "Senior-citizen friendly"]
    const mockQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "33333333-3333-3333-3333-333333333333",
          user_id: "user-123",
          title: "Tirumala Special Darshan",
          preferences: suppliedPreferences,
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const result = await tripService.createTrip("user-123", {
      title: "Tirumala Special Darshan",
      preferences: suppliedPreferences,
    })

    expect(result.preferences).toEqual(suppliedPreferences)
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        title: "Tirumala Special Darshan",
        preferences: suppliedPreferences,
      }),
    )
  })

  it("should embed itinerary when getting trip details", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "00000000-0000-0000-0000-000000000001",
          user_id: "user-123",
          title: "Tirupati Pilgrimage",
          travelers: 4,
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const trip = await tripService.getTrip(
      "00000000-0000-0000-0000-000000000001",
      "user-123",
    )
    expect(trip).not.toBeNull()
    expect(trip?.itinerary).toBeDefined()
    expect(trip?.itinerary?.title).toBe("Sample Itinerary")
  })

  it("should throw NotFoundError if updating a trip that does not exist", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    await expect(
      tripService.updateTrip("non-existent-id", "user-123", {
        title: "Updated",
      }),
    ).rejects.toThrow(NotFoundError)
  })
})
