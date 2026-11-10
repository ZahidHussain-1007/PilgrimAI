import type { Message } from "../../types/message"
import { MessageBubble } from "./MessageBubble"
import { TypingIndicator } from "./TypingIndicator"
export function MessageList({ messages, loading, onFollowUp }: { messages: Message[]; loading: boolean; onFollowUp: (question: string) => void }) {
  return <div className="conversation-view" aria-live="polite">{messages.map((message) => <MessageBubble key={message.id} message={message} onFollowUp={onFollowUp}/>)}{loading && <TypingIndicator/>}</div>
}
