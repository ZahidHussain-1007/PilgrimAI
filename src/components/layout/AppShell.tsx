"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { UserAvatar } from "../ui/UserAvatar"
import { useAuth } from "../../hooks/useAuth"
import { LanguagePicker } from "../landing/LanguagePicker"
import { useT } from "../../lib/i18n"

const links = [
  { href: "/", labelKey: "nav.home", icon: "⌂" },
  { href: "/plan", labelKey: "nav.plan", icon: "✦" },
  { href: "/trips", labelKey: "nav.trips", icon: "↗" },
  { href: "/itineraries", labelKey: "nav.itineraries", icon: "☷" },
  { href: "/conversations", labelKey: "nav.history", icon: "◷" },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { t, lang } = useT()
  const sidebar = (
    <>
      {/* reference-matching faded artwork: rolling hills, curved shikhara
          temple with flag, sun, birds — behind the language selector */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-0">
        <svg viewBox="0 0 290 270" className="w-full" fill="none">
          <circle cx="52" cy="150" r="36" fill="#ecd6ae" opacity="0.45" />
          <circle cx="52" cy="150" r="52" fill="#ecd6ae" opacity="0.15" />
          <path d="M0 270c34-30 74-40 116-32 36 7 64 26 104 26 28 0 50-10 70-24v30H0z" fill="#eddcc0" opacity="0.8" />
          <path d="M0 270c50-20 96-24 148-14 46 9 84 22 142 12v22H0z" fill="#e8d3ae" opacity="0.55" />
          {/* central curved shikhara temple with flag */}
          <path d="M175 270v-86c0-3 1.6-5.8 4.4-7.2l30.6-15 30.6 15c2.8 1.4 4.4 4.2 4.4 7.2v86z" fill="#e2c798" opacity="0.75" />
          <path d="M196 179c0-26 8-46 24-60 16 14 24 34 24 60 0 4-6 8-24 8s-24-4-24-8z" fill="#ddbf8b" opacity="0.8" />
          <path d="M209 126c2-9 7-15 11-18 4 3 9 9 11 18 1 5-4 8-11 8s-12-3-11-8z" fill="#d7b47e" opacity="0.85" />
          <path d="M220 108V92" stroke="#cfa96e" strokeWidth="3" strokeLinecap="round" />
          <path d="M220 92l17 6.5-17 6.5z" fill="#d99a4e" opacity="0.8" />
          <path d="M212 270v-34a8 8 0 0 1 16 0v34z" fill="#f3e8d2" opacity="0.7" />
          {/* side shrines */}
          <path d="M120 270v-52c0-2 1-4 3-5l18-9 18 9c2 1 3 3 3 5v52z" fill="#e9d5b0" opacity="0.6" />
          <path d="M131 214c0-14 4-24 10-31 6 7 10 17 10 31 0 2-3 4-10 4s-10-2-10-4z" fill="#e4cb9e" opacity="0.65" />
          <path d="M141 183v-9" stroke="#cfa96e" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M262 270v-40c0-1.6.8-3.2 2.4-4l14-7 14 7c1.6.8 2.4 2.4 2.4 4v40z" fill="#ecdcbb" opacity="0.55" />
          {/* birds */}
          <path d="M78 92c4-3 7-3 10 0M96 80c4-3 7-3 10 0M112 96c3.4-2.6 6-2.6 9 0" stroke="#cbb28a" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
        </svg>
      </div>
      <div className="brand relative z-10"><span className="brand-mark">ॐ</span><span>PilgrimAI</span></div>
      <nav className="nav-list relative z-10" aria-label="Main navigation">
        {links.map(({ href, labelKey, icon }) => {
          const active = (href === "/itineraries" && pathname.startsWith("/itinerary")) || pathname === href || (href !== "/chat" && pathname.startsWith(`${href}/`))
          return <Link key={href} href={href === "/itineraries" && !user ? "/itinerary" : href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={`nav-link${active ? " active" : ""}`}><span className="nav-icon">{icon}</span>{t(labelKey)}</Link>
        })}
      </nav>
      <div className="relative z-10 mt-auto max-w-full px-1 pb-3 pt-3">
        <LanguagePicker />
      </div>
    </>
  )
  return (
    <div className="shell" data-lang={lang}>
      <aside className={`sidebar${open ? " sidebar-open" : ""}`}>{sidebar}</aside>
      {open && <button aria-label="Close navigation" className="drawer-scrim" onClick={() => setOpen(false)} />}
      <section className="main-panel">
        <header className="topbar">
          <button className="menu-toggle" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
          <span className="mobile-brand"><span className="brand-mark">ॐ</span>PilgrimAI</span>
          <div className="flex flex-col items-start justify-center gap-1">
            <div className="text-xl font-semibold italic leading-tight"><i>Let every journey begin with devotion.</i></div>
            <div className="text-xs font-normal leading-tight">Inspired by the Bhagavad Gita · 9.34</div>
          </div>
          <div className="topbar-right ml-auto">
            {user ? (
              <div className="flex items-center gap-3">
                <Link href="/profile" aria-label={user.name || user.email || "Profile"}>
                  <UserAvatar className="avatar h-11 w-11 text-sm" avatarUrl={user?.avatarUrl} />
                </Link>
                <span className="text-[15px] font-semibold text-[#29251f]">{user.name || user.email}</span>
                <span className="h-6 w-px bg-[#e9d8c1]" aria-hidden="true" />
                <button
                  type="button"
                  className="inline-flex h-[42px] min-w-[120px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#e9d8c1] bg-[#fffdf9] px-5 text-[13px] font-medium text-[#79440f] transition hover:bg-[#f5e9d7]"
                  onClick={async () => { await logout(); router.push("/login") }}
                >
                  <span aria-hidden="true">↪</span>
                  {t("auth.logout")}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-full border border-[#b66a13] px-4 py-1.5 text-xs font-medium text-[#b66a13] transition hover:bg-[#b66a13] hover:text-white"
              >
                {t("auth.signin")}
              </Link>
            )}
          </div>
        </header>
        <main className="page-content">{children}</main>
      </section>
    </div>
  )
}
