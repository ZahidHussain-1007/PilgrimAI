"use client"

import { ChatWindow } from "../chat/ChatWindow"
import { useChat } from "../../hooks/useChat"

export function ChatPage({ conversationId }: { conversationId?: string }) {
  return <ChatConversation key={conversationId ?? "new-chat"} conversationId={conversationId} />
}

function ChatConversation({ conversationId }: { conversationId?: string }) {
  const { messages, error, loading, send, retry } = useChat(conversationId)
  return <ChatWindow conversationId={conversationId} messages={messages} error={error} loading={loading} send={(text) => void send(text)} retry={() => void retry()}/>
}
