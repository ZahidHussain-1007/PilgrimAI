import type { ReactNode } from "react"
import { AppProviders } from "../components/providers/AppProviders"
import "./globals.css"

export const metadata = {
  title: "PilgrimAI",
  description: "Plan meaningful journeys with PilgrimAI.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )

  return (
    <html lang="en">
      <body>
        <AppProviders authConfigured={authConfigured}>{children}</AppProviders>
      </body>
    </html>
  )
}
