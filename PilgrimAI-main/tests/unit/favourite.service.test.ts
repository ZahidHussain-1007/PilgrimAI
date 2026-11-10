import { describe, expect, it, vi, beforeEach } from "vitest"
import { FavouriteService } from "../../src/services/favourites/favourite.service"

const mockSupabase = {
  from: vi.fn(),
}

vi.mock("../../src/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

describe("FavouriteService Unit Tests", () => {
  let favouriteService: FavouriteService

  beforeEach(() => {
    vi.clearAllMocks()
    favouriteService = new FavouriteService()
  })

  it("should add favourite mapping item_type, item_id, and metadata", async () => {
    const mockQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "44444444-4444-4444-4444-444444444444",
          user_id: "user-123",
          item_type: "temple",
          item_id: "yadadri",
          metadata: { title: "Yadadri Temple", notes: "Must attend Nijabhishekam" },
          created_at: "2026-10-27T00:00:00Z",
        },
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const result = await favouriteService.addFavourite("user-123", {
      title: "Yadadri Temple",
      type: "temple",
      templeId: "yadadri",
      notes: "Must attend Nijabhishekam",
    })

    expect(result.id).toBe("44444444-4444-4444-4444-444444444444")
    expect(result.title).toBe("Yadadri Temple")
    expect(result.type).toBe("temple")
    expect(result.templeId).toBe("yadadri")
    expect(result.notes).toBe("Must attend Nijabhishekam")
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        item_type: "temple",
        item_id: "yadadri",
        metadata: { title: "Yadadri Temple", notes: "Must attend Nijabhishekam" },
      }),
    )
  })

  it("should list favourites mapping metadata.title and item_type", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "fav-1",
            user_id: "user-123",
            item_type: "temple",
            item_id: "bhadrachalam",
            metadata: { title: "Bhadrachalam Temple", notes: "On Godavari river" },
            created_at: "2026-10-27T00:00:00Z",
          },
        ],
        error: null,
      }),
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const items = await favouriteService.listFavourites("user-123")
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe("Bhadrachalam Temple")
    expect(items[0].type).toBe("temple")
    expect(items[0].notes).toBe("On Godavari river")
  })

  it("should throw visible error when removing favourite fails", async () => {
    const mockQuery = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    // Second eq call returns error
    mockQuery.eq.mockReturnValueOnce(mockQuery).mockResolvedValueOnce({
      error: { message: "permission denied by RLS" },
    })
    mockSupabase.from.mockReturnValue(mockQuery)

    await expect(
      favouriteService.removeFavourite("fav-1", "user-123"),
    ).rejects.toThrow("Failed to remove favourite: permission denied by RLS")
  })
})
