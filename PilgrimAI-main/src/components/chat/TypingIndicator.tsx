export function TypingIndicator() {
  return <div className="message-row" role="status"><span className="message-avatar" aria-hidden="true">ॐ</span><span className="sr-only">PilgrimAI is responding</span><div className="flex items-center gap-1 rounded-xl bg-[#fffefa] px-4 py-3"><i className="size-1.5 animate-bounce rounded-full bg-[#aa6418]"/><i className="size-1.5 animate-bounce rounded-full bg-[#aa6418] [animation-delay:120ms]"/><i className="size-1.5 animate-bounce rounded-full bg-[#aa6418] [animation-delay:240ms]"/></div></div>
}
