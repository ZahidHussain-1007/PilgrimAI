import { describe, expect, it, vi, beforeEach } from "vitest"
import { getAuthContext } from "../../src/lib/auth/context"
import { requireAuthContext } from "../../src/lib/auth/require-context"
import { UnauthorizedError } from "../../src/lib/api/errors"

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
}

vi.mock("../../src/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

describe("Auth Context Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return unauthenticated context when Supabase returns no user", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const context = await getAuthContext()
    expect(context.isAuthenticated).toBe(false)
    expect(context.user).toBeNull()
  })

  it("should return authenticated context with canonical Supabase UUID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          email: "pilgrim@example.com",
          user_metadata: {
            full_name: "Devotee Pilgrim",
            avatar_url: "https://example.com/avatar.jpg",
          },
        },
      },
      error: null,
    })

    const context = await getAuthContext()
    expect(context.isAuthenticated).toBe(true)
    expect(context.user).not.toBeNull()
    expect(context.user?.id).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6")
    expect(context.user?.email).toBe("pilgrim@example.com")
    expect(context.user?.name).toBe("Devotee Pilgrim")
  })

  it("should throw UnauthorizedError when requireAuthContext is called without a session", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    })

    await expect(requireAuthContext()).rejects.toThrow(UnauthorizedError)
  })

  it("should resolve user successfully when requireAuthContext is called with a session", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          email: "pilgrim@example.com",
          user_metadata: { name: "Pilgrim" },
        },
      },
      error: null,
    })

    const result = await requireAuthContext()
    expect(result.isAuthenticated).toBe(true)
    expect(result.user.id).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6")
  })
})
