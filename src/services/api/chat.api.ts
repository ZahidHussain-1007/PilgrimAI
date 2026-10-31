import { request } from "./client"
import type { Message } from "../../types/message"

const ANON_SESSION_KEY = "pilgrim:backend_session_id"

export const chatApi = {
  send: async (message: string, conversationId?: string): Promise<Message> => {
    // v17: anonymous users get ONE stable backend session id (localStorage)
    // so previous chats survive reloads; signed-in users use conversationId.
    const anonSession =
      !conversationId && typeof window !== "undefined"
        ? window.localStorage.getItem(ANON_SESSION_KEY) || undefined
        : undefined

    const reply = await request<Message>("/chat", {
      method: "POST",
      body: JSON.stringify({
        content: message,
        conversationId: conversationId || undefined,
        sessionId: anonSession,
      }),
    })

    if (
      !conversationId &&
      typeof window !== "undefined" &&
      reply.sessionId
    ) {
      window.localStorage.setItem(ANON_SESSION_KEY, reply.sessionId)
    }
    return reply
  },
}
