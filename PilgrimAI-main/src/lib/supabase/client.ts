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

// NOTE: do NOT create a client at module scope. This module is imported by
// AppProviders on every page; a top-level createClient() runs during browser
// module evaluation and crashes the whole app when env vars are missing or
// empty (the app is designed to render an "unconfigured" state instead).
// Call createClient() lazily, inside try/catch, as auth.service/AppProviders do.
