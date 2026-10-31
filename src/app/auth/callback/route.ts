import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { safeNextPath } from "@/lib/authRedirect"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // audit S01: never follow an attacker-controlled `next`
  const next = safeNextPath(searchParams.get("next"))

  if (code) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`)
      }
    } catch {
      // Failed to exchange code
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
