"use client"

import { useAuth } from "../../hooks/useAuth"
import { UserAvatar } from "../ui/UserAvatar"

export function ProfilePage() {
  const { user } = useAuth()
  return <section className="mx-auto w-full max-w-4xl px-5 pb-12 sm:px-8 lg:px-12">
    <header className="border-b border-[#e8e0d1] py-8 sm:py-11"><p className="text-[10px] font-bold tracking-[.16em] text-[#9a8769]">YOUR ACCOUNT</p><h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#28271f] sm:text-4xl">Profile</h1><p className="mt-2 text-sm text-[#827965]">Your account information and preferences.</p></header>
    {user ? <div className="mt-7 flex items-center gap-4 rounded-2xl border border-[#e9e2d6] bg-[#fffefa] p-5 sm:p-7"><UserAvatar className="avatar avatar-large" avatarUrl={user.avatarUrl}/><div>{user.name && <h2 className="font-serif text-xl text-[#28271f]">{user.name}</h2>}{user.email && <p className="mt-2 text-sm text-[#827965]">{user.email}</p>}{!user.name && !user.email && <p className="text-sm text-[#827965]">Profile details have not been provided.</p>}</div></div> : <div className="mt-7 rounded-2xl border border-[#e9e2d6] bg-[#fffefa] p-6 text-sm text-[#827965]">No profile details are available.</div>}
  </section>
}
