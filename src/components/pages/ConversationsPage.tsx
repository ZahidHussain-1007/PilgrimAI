"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useConversations } from "../../hooks/useConversations"
import type { Conversation } from "../../types/conversation"

export function ConversationsPage() {
  const resource = useConversations()
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  async function createConversation() {
    setCreating(true); setActionError(null)
    try { const conversation = await resource.create(); router.push(`/chat/${encodeURIComponent(conversation.id)}`) }
    catch (error) { setActionError(error instanceof Error ? error.message : "Could not start a conversation.") }
    finally { setCreating(false) }
  }
  async function deleteConversation(conversation: Conversation) {
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return
    setActionError(null)
    try { await resource.remove(conversation.id); resource.retry() }
    catch (error) { setActionError(error instanceof Error ? error.message : "Could not delete this conversation.") }
  }
  return <section className="mx-auto w-full max-w-5xl px-5 pb-12 sm:px-8 lg:px-12">
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[#e8e0d1] py-8 sm:py-11"><div><p className="text-[10px] font-bold tracking-[.16em] text-[#9a8769]">YOUR NOTES & PLANS</p><h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#28271f] sm:text-4xl">Conversation history</h1><p className="mt-2 text-sm text-[#827965]">Return to a thought or continue planning.</p></div><button disabled={creating} onClick={createConversation} className="min-h-11 rounded-xl bg-[#aa6418] px-4 text-sm font-semibold text-white hover:bg-[#79440f] disabled:opacity-60">{creating ? "Starting…" : "+ New conversation"}</button></header>
    {actionError && <p className="mt-5 rounded-xl border border-[#f2d5ce] bg-[#fff1ed] p-4 text-sm text-[#994b39]" role="alert">{actionError}</p>}
    {resource.loading && <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-[#827965]" role="status"><span className="size-4 animate-spin rounded-full border-2 border-[#e4dac8] border-t-[#aa6418]"/>Loading conversations…</div>}
    {resource.error && <div className="mt-7 rounded-2xl border border-[#eadfca] bg-[#fffefa] p-6" role="alert"><h2 className="font-serif text-xl text-[#28271f]">Conversations are unavailable</h2><p className="mt-2 text-sm text-[#827965]">{resource.error.message}</p><button className="mt-4 min-h-10 rounded-lg border border-[#d9c9ae] px-3 text-sm font-semibold text-[#79440f]" onClick={resource.retry}>Try again</button></div>}
    {!resource.loading && !resource.error && resource.data?.length === 0 && <div className="mx-auto flex min-h-[340px] max-w-lg flex-col items-center justify-center py-12 text-center"><div className="grid size-14 place-items-center rounded-full bg-[#f6f0e5] text-2xl text-[#ae7a3d]" aria-hidden="true">◷</div><h2 className="mt-5 font-serif text-2xl text-[#28271f]">A clean slate</h2><p className="mt-2 text-sm leading-6 text-[#827965]">Your conversations will show here when the service is connected.</p><Link href="/chat" className="mt-5 min-h-11 rounded-xl bg-[#aa6418] px-4 py-3 text-sm font-semibold text-white">Start a conversation</Link></div>}
    {!resource.loading && !resource.error && Boolean(resource.data?.length) && <ul className="mt-6 divide-y divide-[#eee8dc] rounded-2xl border border-[#e9e2d6] bg-[#fffefa]">{resource.data?.map((conversation) => <li className="flex items-center gap-3 p-4 sm:p-5" key={conversation.id}><Link className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-[#aa6418]" href={`/chat/${encodeURIComponent(conversation.id)}`}><span className="block truncate font-medium text-[#28271f]">{conversation.title || "Conversation"}</span>{conversation.updatedAt && <span className="mt-1 block text-xs text-[#827965]">{conversation.updatedAt}</span>}</Link><button className="min-h-10 rounded-lg px-3 text-sm text-[#8b5545] hover:bg-[#fff1ed]" onClick={() => void deleteConversation(conversation)} aria-label={`Delete ${conversation.title || "conversation"}`}>Delete</button></li>)}</ul>}
  </section>
}
