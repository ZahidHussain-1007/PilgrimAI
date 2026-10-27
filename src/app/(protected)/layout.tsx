import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getAuthContext } from "@/lib/auth/context"
import { ProtectedLayout } from "../../components/providers/ProtectedLayout"

export default async function Layout({ children }: { children: ReactNode }) {
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  if (!authConfigured) redirect("/login?error=configuration")

  const { isAuthenticated, user } = await getAuthContext()
  if (!isAuthenticated || !user) redirect("/login")

  return <ProtectedLayout>{children}</ProtectedLayout>
}
