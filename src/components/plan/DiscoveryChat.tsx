"use client"

import { useEffect, useRef, useState } from "react"
import { templeChatApi } from "../../services/api/templeChat.api"
import type { TempleSummary } from "../../lib/temples"
import { useT } from "../../lib/i18n"
import { shortTempleName } from "./trailTempleData"

type ChatMsg = {
  id: number
  role: "user" | "assistant"
  text: string
  matchIds?: string[]
}

/** Local conversation snapshot so a reload restores the thread instantly
 *  (no starter-suggestion flash) without waiting on the network. */
const STATE_KEY = "pilgrim:temple_chat_state"
const MAX_STORED = 30

function loadStored(): ChatMsg[] | null {
  try {
    const raw = sessionStorage.getItem(STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const msgs = parsed.filter(
      (m): m is ChatMsg =>
        m && typeof m.id === "number" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string",
    )
    return msgs.length > 0 ? msgs : null
  } catch {
    return null
  }
}

function persist(msgs: ChatMsg[]) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(msgs.slice(-MAX_STORED)))
  } catch {
    /* storage may be unavailable — chat still works, just not restored */
  }
}

/** Monotonic id from the list itself — survives hydration/remounts. */
function nextIdOf(msgs: ChatMsg[]): number {
  return msgs.reduce((max, m) => Math.max(max, m.id), 0) + 1
}

/** Chat with PilgrimAI — shares the SAME selection state as the trail.
 *  Temple matches come from server-validated catalog names (exact match)
 *  with deterministic substring matching as fallback. Starter suggestions
 *  derive from conversation state: they unmount as soon as the thread
 *  contains a user message and return only via an explicit "New chat". */
export function DiscoveryChat({
  temples,
  selectedIds,
  onAdd,
}: {
  temples: TempleSummary[]
  selectedIds: string[]
  onAdd: (id: string) => void
}) {
  const { t } = useT()
  const [initial] = useState(() => {
    const stored = loadStored()
    const restored = Boolean(stored && stored.some((m) => m.role === "user"))
    return {
      restored,
      msgs: restored
        ? (stored as ChatMsg[])
        : [{ id: 0, role: "assistant" as const, text: t("discover.chatIntro") }],
    }
  })
  const [messages, setMessages] = useState<ChatMsg[]>(initial.msgs)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  /** Follow new messages only while the reader is near the bottom. */
  const stickRef = useRef(true)
  const scrolledOnce = useRef(false)
  const lastFailed = useRef<string | null>(null)

  useEffect(() => {
    persist(messages)
  }, [messages])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    if (!scrolledOnce.current) {
      scrolledOnce.current = true
      // restored thread opens at the latest message; a fresh thread keeps
      // the greeting visible without scrolling
      if (initial.restored) el.scrollTop = el.scrollHeight
      return
    }
    if (stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, busy, initial.restored])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const chips = [
    t("discover.chipShiva"),
    t("discover.chipNear"),
    t("discover.chipOneDay"),
    t("discover.chipFamous"),
  ]

  /** Visibility from conversation state — never CSS. Whitespace-only input
   *  returns before any message is pushed, so it cannot dismiss starters. */
  const showStarters = !messages.some((m) => m.role === "user")

  function matchTemples(reply: string): string[] {
    const lower = reply.toLowerCase()
    const hits: string[] = []
    for (const tm of temples) {
      const keys = [tm.name, shortTempleName(tm.name), tm.city, tm.deity]
        .filter(Boolean)
        .map((k) => String(k).toLowerCase().replace(/^sri\s+/, ""))
      if (keys.some((k) => k.length >= 4 && lower.includes(k))) hits.push(tm.templeId)
      if (hits.length >= 4) break
    }
    return hits
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    stickRef.current = true
    setError(null)
    setDraft("")
    // optimistic user bubble lands BEFORE the request — starters unmount
    // on this state change, not after the response
    setMessages((m) => [...m, { id: nextIdOf(m), role: "user", text: content }])
    await ask(content)
  }

  /** Request half of a turn. `text` was already pushed by send(); a retry
   *  reuses the stored failed text without duplicating the bubble. */
  async function ask(text: string) {
    setBusy(true)
    setError(null)
    try {
      const reply = await templeChatApi.send(text)
      const replyText = reply?.content || ""
      // server-validated catalog names win; substring match stays as fallback
      const fromServer = (reply?.suggestions ?? [])
        .map((name) =>
          temples.find((tm) => tm.name.toLowerCase() === name.toLowerCase())?.templeId,
        )
        .filter((id): id is string => Boolean(id))
      const matchIds = fromServer.length ? [...new Set(fromServer)] : matchTemples(replyText)
      lastFailed.current = null
      setMessages((m) => [
        ...m,
        { id: nextIdOf(m), role: "assistant", text: replyText, matchIds },
      ])
    } catch {
      setError(t("discover.chatError"))
      lastFailed.current = text
    } finally {
      setBusy(false)
    }
  }

  /** Explicit reset only — the one path that brings starters back. */
  function resetChat() {
    if (busy) return
    try {
      sessionStorage.removeItem(STATE_KEY)
    } catch {
      /* ignore */
    }
    templeChatApi.resetSession()
    lastFailed.current = null
    stickRef.current = true
    setError(null)
    setDraft("")
    setMessages([{ id: 0, role: "assistant", text: t("discover.chatIntro") }])
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[#e9d8c1] bg-[#fffdf9]">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[#efe6d4] px-5 py-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f6efe3] text-[#b66a13]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.6L19.5 9l-4.4 3.4L16.2 18 12 14.9 7.8 18l1.1-5.6L4.5 9l5.7-1.4z"/></svg>
        </span>
        <h2 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-[#29251f]">
          {t("discover.chatTitle")}
        </h2>
        <button
          type="button"
          onClick={resetChat}
          aria-label={t("discover.newChat")}
          className="shrink-0 rounded-full border border-[#e9d8c1] bg-[#faf6ee] px-2.5 py-1 text-[11px] text-[#79440f] transition hover:bg-[#f5e9d7]"
        >
          + {t("discover.newChat")}
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex gap-2.5"}>
            {m.role === "assistant" && (
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f6efe3] text-sm text-[#b66a13]">ॐ</span>
            )}
            <div
              className={`max-w-[86%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "bg-[#b66a13] text-white"
                  : "bg-[#f7f2e7] text-[#4a4436]"
              }`}
            >
              {m.text}
              {m.matchIds && m.matchIds.length > 0 && (
                <div className="mt-2.5 space-y-1.5 border-t border-[#e9dfca] pt-2.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#9a8f7b]">
                    {t("discover.matchFound")}
                  </p>
                  {m.matchIds.map((id) => {
                    const tm = temples.find((x) => x.templeId === id)
                    if (!tm) return null
                    const sel = selectedIds.includes(id)
                    return (
                      <div key={id} className="flex items-center gap-2 rounded-xl border border-[#efe2c8] bg-[#fffdf9] p-1.5">
                        {tm.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tm.image} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6efe3] text-xs">🛕</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-semibold text-[#29251f]">{tm.name}</p>
                          <p className="truncate text-[10px] text-[#796b5d]">{tm.city}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onAdd(id)}
                          disabled={sel}
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition ${
                            sel
                              ? "cursor-default bg-[#f5e9d7] text-[#79440f]"
                              : "bg-[#b66a13] text-white hover:bg-[#99580d]"
                          }`}
                        >
                          {sel ? `✓ ${t("discover.added")}` : t("discover.addShort")}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f6efe3] text-sm text-[#b66a13]">ॐ</span>
            <div className="rounded-2xl bg-[#f7f2e7] px-4 py-3 text-[13px] text-[#9a8f7b]">…</div>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-[#f2d5ce] bg-[#fff1ed] px-3 py-2">
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#994b39]">{error}</p>
            {lastFailed.current && !busy && (
              <button
                type="button"
                onClick={() => void ask(lastFailed.current as string)}
                className="shrink-0 rounded-full border border-[#e7b3a6] bg-white px-3 py-1 text-[11px] font-semibold text-[#994b39] transition hover:bg-[#fff1ed]"
              >
                ↻ {t("discover.chatRetry")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[#efe6d4] px-4 py-3">
        {showStarters && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => void send(c)}
                className="rounded-full border border-[#e9d8c1] bg-[#faf6ee] px-2.5 py-1 text-[11px] text-[#79440f] transition hover:bg-[#f5e9d7] disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); void send(draft) }}
          className="flex items-center gap-2 rounded-full border border-[#e2d7c2] bg-white px-4 py-1.5 focus-within:border-[#c7a878]"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("discover.chatPlaceholder")}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none placeholder:text-[#aaa393]"
            aria-label={t("discover.chatPlaceholder")}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#b66a13] text-white transition hover:bg-[#99580d] disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>
          </button>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-[#a29a89]">{t("discover.chatNote")}</p>
      </div>
    </div>
  )
}
