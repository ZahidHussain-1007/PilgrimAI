"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserMenu } from "./UserMenu"
import { UserAvatar } from "../ui/UserAvatar"
import { useAuth } from "../../hooks/useAuth"

const links = [
  { href: "/chat", label: "New plan", icon: "✦" },
  { href: "/trips", label: "My trips", icon: "↗" },
  { href: "/favourites", label: "Favourites", icon: "♡" },
  { href: "/itineraries", label: "Itineraries", icon: "☷" },
  { href: "/conversations", label: "History", icon: "◷" },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { user } = useAuth()
  const sidebar = (
    <>
      <div className="brand"><span className="brand-mark">ॐ</span><span>PilgrimAI</span></div>
      <nav className="nav-list" aria-label="Main navigation">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/chat" && pathname.startsWith(`${href}/`))
          return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={`nav-link${active ? " active" : ""}`}><span className="nav-icon">{icon}</span>{label}</Link>
        })}
      </nav>
      <UserMenu onNavigate={() => setOpen(false)} />
    </>
  )
  return (
    <div className="shell">
      <aside className={`sidebar${open ? " sidebar-open" : ""}`}>{sidebar}</aside>
      {open && <button aria-label="Close navigation" className="drawer-scrim" onClick={() => setOpen(false)} />}
      <section className="main-panel">
        <header className="topbar">
          <button className="menu-toggle" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
          <span className="mobile-brand"><span className="brand-mark">ॐ</span>PilgrimAI</span>
          <div className="topbar-right"><span className="quiet-label">A quieter way to travel</span><UserAvatar className="avatar avatar-small" avatarUrl={user?.avatarUrl} /></div>
        </header>
        <main className="page-content">{children}</main>
      </section>
    </div>
  )
}
