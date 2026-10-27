import type { Message } from "../../types/message"
import { SourceList } from "./SourceList"
import { TripCreatedCard } from "./TripCreatedCard"
import { UserAvatar } from "../ui/UserAvatar"
export function MessageBubble({ message, onFollowUp }: { message: Message; onFollowUp?: (question: string) => void }) {
  const user = message.role === "user"
  return <article className={`message-row ${user ? "justify-end" : "justify-start"}`}>{user ? <UserAvatar className="message-avatar"/> : <span className="message-avatar" aria-hidden="true">ॐ</span>}<div className={`max-w-[min(85%,38rem)] ${user ? "rounded-2xl rounded-br-sm bg-[#aa6418] px-4 py-3 text-white" : "rounded-2xl rounded-bl-sm border border-[#e9e2d6] bg-[#fffefa] px-4 py-3 text-[#28271f]"}`}><p className="message-author">{user ? "You" : "PilgrimAI"}</p>{message.content && <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>}{message.trip && <TripCreatedCard trip={message.trip} />}{!user && message.sources && <SourceList sources={message.sources} />}{!user && message.followUpQuestions?.length ? <div className="mt-3 flex flex-wrap gap-2">{message.followUpQuestions.map((question) => <button className="rounded-full border border-[#e9e2d6] px-3 py-2 text-xs text-[#79440f] hover:bg-[#f6efe3]" key={question} onClick={() => onFollowUp?.(question)}>{question}</button>)}</div> : null}</div></article>
}
