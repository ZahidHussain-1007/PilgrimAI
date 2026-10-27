import { createClient } from "../supabase/server"

export type AuthUser = {
  id: string
  email?: string
  name?: string
  avatarUrl?: string
}

export type AuthContext = {
  user: AuthUser | null
  isAuthenticated: boolean
}

export async function getAuthContext(): Promise<AuthContext> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (!error && user) {
      return {
        user: {
          id: user.id,
          email: user.email,
          name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0],
          avatarUrl: user.user_metadata?.avatar_url,
        },
        isAuthenticated: true,
      }
    }
  } catch {
    // Supabase auth check failed or client unavailable
  }

  return {
    user: null,
    isAuthenticated: false,
  }
}
