import { useState } from "react"
import type { Message } from "../../types/message"
import { ChatHeader } from "./ChatHeader"
import { ChatInput } from "./ChatInput"
import { ChatError } from "./ChatError"
import { MessageList } from "./MessageList"
import { SuggestedPrompts } from "./SuggestedPrompts"
export function ChatWindow({ conversationId, messages, loading, error, send, retry }: { conversationId?: string; messages: Message[]; loading: boolean; error: Error | null; send: (text: string) => void; retry: () => void }) {
  const [draft, setDraft] = useState("")
  const choose = (prompt: string) => setDraft(prompt)
  return <section className="chat-page flex min-h-full flex-col"><ChatHeader conversationId={conversationId}/>{messages.length === 0 ? <div className="welcome-wrap"><div className="welcome-art"><span className="welcome-halo"/><span className="welcome-om">ॐ</span><span className="welcome-star star-one">✳</span><span className="welcome-star star-two">✧</span></div><div className="eyebrow">YOUR JOURNEY, AT YOUR PACE</div><h1>{conversationId ? "Pick up where you left off." : "Where would you like to begin?"}</h1><p className="welcome-subtitle">A little inspiration, a thoughtful plan, or a place you’ve been meaning to visit.<br className="desktop-only"/> Start wherever you are.</p><SuggestedPrompts onChoose={choose}/></div> : <MessageList messages={messages} loading={loading} onFollowUp={(question) => send(question)}/ >}{error && <ChatError message={error.message} retry={retry} disabled={loading}/>}<ChatInput key={conversationId ?? "new-chat"} value={draft} onChange={setDraft} disabled={loading} onSend={send}/></section>
}
