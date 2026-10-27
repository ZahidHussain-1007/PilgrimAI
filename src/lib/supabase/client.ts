import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase URL and publishable key must be configured in environment variables.",
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export const supabaseBrowserClient =
  typeof window !== "undefined" ? createClient() : null
