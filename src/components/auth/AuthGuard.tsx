"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../../hooks/useAuth"

export function AuthGuard({ children }: { children: ReactNode }) {
  const { status, refresh } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login")
  }, [status, router])

  if (status === "checking" || status === "unauthenticated") {
    return <main className="flex min-h-screen items-center justify-center text-sm text-[#827965]" role="status">Checking your session…</main>
  }
  if (status === "error") {
    return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center"><h1 className="font-serif text-2xl text-[#28271f]">Authentication service is currently unavailable.</h1><p className="mt-3 text-sm text-[#827965]">Try again later.</p><button className="mt-5 min-h-10 rounded-lg border border-[#d9c9ae] px-4 text-sm font-semibold text-[#79440f]" onClick={() => void refresh()}>Try again</button></main>
  }
  return <>{children}</>
}
