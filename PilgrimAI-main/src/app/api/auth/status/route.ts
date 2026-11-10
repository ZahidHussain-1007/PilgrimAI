import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export function GET() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )

  return NextResponse.json({ configured }, { headers: { "Cache-Control": "no-store" } })
}
