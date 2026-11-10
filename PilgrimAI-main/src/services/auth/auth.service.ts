import { createClient } from "../../lib/supabase/client"
import type { User } from "../../types/user"

export const authService = {
  async getCurrentUser(): Promise<User | null> {
    try {
      const supabase = createClient()
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (error || !user) return null

      return {
        id: user.id,
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0],
        email: user.email ?? undefined,
        avatarUrl: user.user_metadata?.avatar_url ?? undefined,
      }
    } catch {
      return null
    }
  },

  async isConfigured(): Promise<boolean> {
    const response = await fetch("/api/auth/status", { cache: "no-store" })
    if (!response.ok) throw new Error("Unable to check sign-in availability.")
    const result = (await response.json()) as { configured?: boolean }
    return result.configured === true
  },

  async loginWithGoogle(): Promise<void> {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback`,
      },
    })
    if (error) throw error
    if (data?.url) {
      window.location.href = data.url
    }
  },

  async logout(): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },
}