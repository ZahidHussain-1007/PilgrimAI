export function ChatHeader({ conversationId }: { conversationId?: string }) {
  return <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-5 sm:px-8"><div><p className="text-[10px] font-bold tracking-[.15em] text-[#9a8769]">PLANNING SPACE</p>{conversationId && <p className="mt-1 text-xs text-[#827965]">Conversation</p>}</div><span className="rounded-full border border-[#e8e0d1] bg-[#fffefa] px-3 py-1.5 text-[11px] text-[#827965]">Your plans stay in chat</span></header>
}
