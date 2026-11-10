import { describe, expect, it, vi, beforeEach } from "vitest"
import { ItineraryService } from "../../src/services/itineraries/itinerary.service"

const mockSupabase = {
  from: vi.fn(),
}

vi.mock("../../src/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

describe("ItineraryService Unit Tests", () => {
  let itineraryService: ItineraryService

  beforeEach(() => {
    vi.clearAllMocks()
    itineraryService = new ItineraryService()
  })

  it("should get itinerary by tripId and group activities by day_number", async () => {
    // 1. Query for itineraries by trip_id
    const mockItinQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "itin-100",
          trip_id: "trip-100",
          status: "planning",
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }

    // 2. Query for itinerary_items
    const mockItemsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    }
    // second order call resolves data
    mockItemsQuery.order
      .mockReturnValueOnce(mockItemsQuery)
      .mockResolvedValueOnce({
        data: [
          {
            id: "act-1",
            itinerary_id: "itin-100",
            day_number: 1,
            title: "Morning Suprabhatam",
            start_time: "04:30 AM",
            end_time: "05:30 AM",
            description: "Sacred awakening seva",
            estimated_cost: 500,
          },
          {
            id: "act-2",
            itinerary_id: "itin-100",
            day_number: 1,
            title: "Nijabhishekam",
            start_time: "06:00 AM",
            end_time: "07:30 AM",
            description: "Main abhishekam",
            estimated_cost: 1000,
          },
          {
            id: "act-3",
            itinerary_id: "itin-100",
            day_number: 2,
            title: "Pradakshina and Return",
            start_time: "08:00 AM",
            end_time: "10:00 AM",
            description: "Giri pradakshina",
            estimated_cost: 200,
          },
        ],
        error: null,
      })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "itineraries") return mockItinQuery
      if (table === "itinerary_items") return mockItemsQuery
      return {}
    })

    const itinerary = await itineraryService.getItineraryByTripId(
      "trip-100",
      "user-123",
    )

    expect(itinerary).not.toBeNull()
    expect(itinerary?.id).toBe("itin-100")
    expect(itinerary?.estimatedCost).toBe(1700)
    expect(itinerary?.days).toHaveLength(2)
    expect(itinerary?.days?.[0].label).toBe("Day 1")
    expect(itinerary?.days?.[0].activities).toHaveLength(2)
    expect(itinerary?.days?.[1].label).toBe("Day 2")
    expect(itinerary?.days?.[1].activities).toHaveLength(1)
  })

  it("should create itinerary with valid UUID and insert into itinerary_items with day_number", async () => {
    const mockTripQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    }
    // eq calls for trip check
    mockTripQuery.eq.mockReturnValue(mockTripQuery)
    mockTripQuery.maybeSingle.mockResolvedValue({
      data: { id: "trip-100" },
      error: null,
    })

    const mockItinInsert = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "itin-new-uuid",
          trip_id: "trip-100",
          status: "planning",
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "trips") return mockTripQuery
      if (table === "itineraries") return mockItinInsert
      return {}
    })

    const result = await itineraryService.createItinerary("user-123", {
      tripId: "trip-100",
      title: "Weekend Darshan",
      estimatedCost: 1500,
    })

    expect(result.id).toBe("itin-new-uuid")
    expect(mockItinInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trip_id: "trip-100",
        status: "planning",
      }),
    )
  })
})
