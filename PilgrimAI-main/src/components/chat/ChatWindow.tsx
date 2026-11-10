import { useState } from "react"
import { useT } from "../../lib/i18n"
import type { Message } from "../../types/message"
import { ChatHeader } from "./ChatHeader"
import { ChatInput } from "./ChatInput"
import { ChatError } from "./ChatError"
import { MessageList } from "./MessageList"
import { SuggestedPrompts } from "./SuggestedPrompts"
export function ChatWindow({
  conversationId, messages, loading, error, send, retry }: { conversationId?: string; messages: Message[]; loading: boolean; error: Error | null; send: (text: string) => void; retry: () => void }) {
  const { t } = useT()
  const [draft, setDraft] = useState("")
  const choose = (prompt: string) => setDraft(prompt)
  return <section className="chat-page flex min-h-full flex-col"><ChatHeader conversationId={conversationId}/>{messages.length === 0 ? <div className="welcome-wrap"><div className="welcome-art"><span className="welcome-halo"/><span className="welcome-om">ॐ</span><span className="welcome-star star-one">✳</span><span className="welcome-star star-two">✧</span></div><div className="eyebrow">{t("chat.eyebrow").toUpperCase()}</div><h1>{conversationId ? t("chat.titleResume") : t("chat.titleBegin")}</h1><p className="welcome-subtitle">{t("chat.sub")}</p><SuggestedPrompts onChoose={choose}/></div> : <MessageList messages={messages} loading={loading} onFollowUp={(question) => send(question)}/ >}{error && <ChatError message={error.message} retry={retry} disabled={loading}/>}<ChatInput key={conversationId ?? "new-chat"} value={draft} onChange={setDraft} disabled={loading} onSend={send}/></section>
}
