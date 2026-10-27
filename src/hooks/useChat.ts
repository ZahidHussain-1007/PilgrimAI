import { useEffect, useState } from "react"
import { chatApi } from "../services/api/chat.api"
import { request } from "../services/api/client"
import type { Message } from "../types/message"

export function useChat(conversationId?: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastMessage, setLastMessage] = useState("")
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(conversationId)

  useEffect(() => {
    setActiveConversationId(conversationId)
  }, [conversationId])

  useEffect(() => {
    let cancelled = false
    if (!conversationId) {
      setMessages([])
      return
    }

    async function loadHistory() {
      setLoading(true)
      setError(null)
      try {
        const history = await request<Message[]>(
          `/conversations/${encodeURIComponent(conversationId!)}/messages`,
        )
        if (!cancelled && Array.isArray(history)) {
          setMessages(history)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to load message history."),
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [conversationId])

  async function send(text: string, append = true) {
    if (!text.trim() || loading) return
    setLastMessage(text.trim())
    if (append)
      setMessages((items) => [
        ...items,
        { id: String(Date.now()), role: "user", content: text.trim() },
      ])
    setLoading(true)
    setError(null)
    try {
      const targetConversationId = activeConversationId || conversationId
      const reply = await chatApi.send(text.trim(), targetConversationId)
      if (reply.conversationId && !activeConversationId) {
        setActiveConversationId(reply.conversationId)
      }
      setMessages((items) => [...items, reply])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason
          : new Error("Unable to send your message."),
      )
    } finally {
      setLoading(false)
    }
  }

  return {
    messages,
    loading,
    error,
    send,
    retry: () => send(lastMessage, false),
    conversationId: activeConversationId || conversationId,
  }
}
