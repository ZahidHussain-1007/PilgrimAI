import { request } from "./client"
import { getStoredLanguage } from "../../lib/prefs"

export type TempleSuggestReply = {
  content?: string
  /** exact catalog temple names validated server-side */
  suggestions?: string[]
  /** backend session id echoed for follow-up turns */
  sessionId?: string
}

const SESSION_KEY = "pilgrim:temple_session_id"

/** Plan-page discovery chat — scoped to the23-temple catalog.
 *  Talks to Next /api/plan/temple-chat → multiagent /temple-suggest. */
export const templeChatApi = {
  send: async (message: string): Promise<TempleSuggestReply> => {
    const sessionId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(SESSION_KEY) || undefined
        : undefined

    const reply = await request<TempleSuggestReply>("/plan/temple-chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        sessionId,
        language: getStoredLanguage(),
      }),
    })

    if (reply?.sessionId && typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_KEY, reply.sessionId)
    }
    return reply
  },

  /** Explicit "New chat" — the next message starts a fresh backend session. */
  resetSession: (): void => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(SESSION_KEY)
      } catch {
        /* ignore */
      }
    }
  },
}
