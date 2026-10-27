import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const requestUrl = new URL(request.url)
    const redirectTo = `${requestUrl.origin}/auth/callback`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    })

    if (error || !data.url) {
      return NextResponse.redirect(
        new URL("/login?error=oauth_init_failed", request.url),
      )
    }

    return NextResponse.redirect(data.url)
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=server_error", request.url),
    )
  }
}
