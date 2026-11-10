"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { authService } from "../../services/auth/auth.service"
import { createClient } from "../../lib/supabase/client"
import type { User } from "../../types/user"

export type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "error"

type AuthContextValue = {
  status: AuthStatus
  authenticated: boolean
  user: User | null
  error: Error | null
  refresh: () => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function AuthStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>("checking")
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const currentUser = await authService.getCurrentUser()
      setUser(currentUser)
      setStatus(currentUser ? "authenticated" : "unauthenticated")
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason
          : new Error("Unable to check your session."),
      )
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void refresh()

    try {
      const supabase = createClient()
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            name:
              session.user.user_metadata?.full_name ||
              session.user.user_metadata?.name ||
              session.user.email?.split("@")[0],
            email: session.user.email ?? undefined,
            avatarUrl: session.user.user_metadata?.avatar_url ?? undefined,
          })
          setStatus("authenticated")
        } else {
          setUser(null)
          setStatus("unauthenticated")
        }
      })

      return () => {
        subscription.unsubscribe()
      }
    } catch {
      // Supabase client initialization fallback
    }
  }, [refresh])

  const loginWithGoogle = useCallback(async () => {
    await authService.loginWithGoogle()
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
    setStatus("unauthenticated")
    setError(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      authenticated: status === "authenticated",
      user,
      error,
      refresh,
      loginWithGoogle,
      logout,
    }),
    [status, user, error, refresh, loginWithGoogle, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const unconfiguredAuth: AuthContextValue = {
  status: "unauthenticated",
  authenticated: false,
  user: null,
  error: null,
  refresh: async () => undefined,
  loginWithGoogle: async () => {
    throw new Error("Google sign-in is not configured yet.")
  },
  logout: async () => {
    throw new Error("No authenticated session is available.")
  },
}

export function AppProviders({
  children,
  authConfigured,
}: {
  children: ReactNode
  authConfigured: boolean
}) {
  if (!authConfigured) {
    return (
      <AuthContext.Provider value={unconfiguredAuth}>
        {children}
      </AuthContext.Provider>
    )
  }

  return <AuthStateProvider>{children}</AuthStateProvider>
}

export function useAuthContext() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuthContext must be used within AppProviders")
  return value
}
