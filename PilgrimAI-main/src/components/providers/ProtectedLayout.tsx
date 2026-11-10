"use client"

import type { ReactNode } from "react"
import { AuthGuard } from "../auth/AuthGuard"
import { AppShell } from "../layout/AppShell"

export function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AuthGuard><AppShell>{children}</AppShell></AuthGuard>
}
