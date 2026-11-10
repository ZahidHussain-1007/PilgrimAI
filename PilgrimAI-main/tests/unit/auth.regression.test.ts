import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { authService } from "../../src/services/auth/auth.service"
import { GET as getAuthStatus } from "../../src/app/api/auth/status/route"
import { GET as getGoogleAuth } from "../../src/app/api/auth/google/route"

const mockBrowserSupabase = {
  auth: {
    getUser: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  },
}

const mockServerSupabase = {
  auth: {
    signInWithOAuth: vi.fn(),
  },
}

vi.mock("../../src/lib/supabase/client", () => ({
  createClient: vi.fn(() => mockBrowserSupabase),
}))

vi.mock("../../src/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockServerSupabase)),
}))

describe("Auth.js Removal and Supabase Auth Regression Suite", () => {
  const rootDir = path.resolve(import.meta.dirname, "../..")

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Residual Auth.js Absence Verification", () => {
    it("should confirm legacy Auth.js files have been completely removed", () => {
      const legacyAuthFile = path.join(rootDir, "src/auth.ts")
      const legacyTypesFile = path.join(rootDir, "src/types/next-auth.d.ts")
      const legacyRouteDir = path.join(rootDir, "src/app/api/auth/[...nextauth]")

      expect(fs.existsSync(legacyAuthFile)).toBe(false)
      expect(fs.existsSync(legacyTypesFile)).toBe(false)
      expect(fs.existsSync(legacyRouteDir)).toBe(false)
    })

    it("should confirm next-auth dependency has been removed from package.json", () => {
      const pkgPath = path.join(rootDir, "package.json")
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))

      expect(pkg.dependencies?.["next-auth"]).toBeUndefined()
      expect(pkg.devDependencies?.["next-auth"]).toBeUndefined()
    })
  })

  describe("Supabase authService Contract", () => {
    it("should retrieve the current user and adapt to canonical User shape", async () => {
      mockBrowserSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: "uuid-user-123",
            email: "pilgrim@example.com",
            user_metadata: {
              full_name: "Pilgrim Seeker",
              avatar_url: "https://example.com/photo.png",
            },
          },
        },
        error: null,
      })

      const user = await authService.getCurrentUser()
      expect(user).toEqual({
        id: "uuid-user-123",
        name: "Pilgrim Seeker",
        email: "pilgrim@example.com",
        avatarUrl: "https://example.com/photo.png",
      })
    })

    it("should return null when no session exists or error occurs", async () => {
      mockBrowserSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Auth session missing" },
      })

      const user = await authService.getCurrentUser()
      expect(user).toBeNull()
    })

    it("should check configuration status against /api/auth/status", async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ configured: true }),
      } as Response)

      const isConfigured = await authService.isConfigured()
      expect(isConfigured).toBe(true)
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/status", { cache: "no-store" })

      globalThis.fetch = originalFetch
    })

    it("should initiate Google OAuth with correct /auth/callback redirect", async () => {
      const originalWindow = globalThis.window
      const mockLocation = {
        origin: "https://pilgrim.app",
        href: "",
      }
      // @ts-expect-error Mocking window for node test environment
      globalThis.window = { location: mockLocation }

      mockBrowserSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: "https://accounts.google.com/o/oauth2/v2/auth?mock=true" },
        error: null,
      })

      await authService.loginWithGoogle()

      expect(mockBrowserSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "https://pilgrim.app/auth/callback",
        },
      })
      expect(mockLocation.href).toBe("https://accounts.google.com/o/oauth2/v2/auth?mock=true")

      globalThis.window = originalWindow
    })

    it("should propagate error when signInWithOAuth fails", async () => {
      mockBrowserSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: new Error("OAuth provider error"),
      })

      await expect(authService.loginWithGoogle()).rejects.toThrow("OAuth provider error")
    })

    it("should call supabase signOut on logout", async () => {
      mockBrowserSupabase.auth.signOut.mockResolvedValue({ error: null })

      await authService.logout()
      expect(mockBrowserSupabase.auth.signOut).toHaveBeenCalled()
    })

    it("should throw error if supabase signOut fails", async () => {
      mockBrowserSupabase.auth.signOut.mockResolvedValue({ error: new Error("Logout failed") })

      await expect(authService.logout()).rejects.toThrow("Logout failed")
    })
  })

  describe("Authentication API Route Handlers", () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      process.env = { ...originalEnv }
    })

    it("/api/auth/status returns configured: true when Supabase env vars are present", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb-publishable-key"

      const response = getAuthStatus()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ configured: true })
    })

    it("/api/auth/status returns configured: false when Supabase env vars are missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

      const response = getAuthStatus()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ configured: false })
    })

    it("/api/auth/google initiates Supabase OAuth redirect to provider URL", async () => {
      mockServerSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=google" },
        error: null,
      })

      const request = new Request("http://localhost:3000/api/auth/google")
      const response = await getGoogleAuth(request)

      expect(mockServerSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/auth/callback",
        },
      })
      expect(response.status).toBe(307)
      expect(response.headers.get("Location")).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=google",
      )
    })

    it("/api/auth/google redirects to /login?error=oauth_init_failed on error", async () => {
      mockServerSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: { message: "OAuth misconfigured" },
      })

      const request = new Request("http://localhost:3000/api/auth/google")
      const response = await getGoogleAuth(request)

      expect(response.status).toBe(307)
      expect(response.headers.get("Location")).toContain("/login?error=oauth_init_failed")
    })
  })
})
