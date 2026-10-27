export function ChatError({ message, retry, disabled }: { message: string; retry: () => void; disabled?: boolean }) {
  return <div className="mx-auto mb-4 flex w-full max-w-3xl items-center justify-between gap-4 rounded-xl border border-[#eadfca] bg-[#f8f3ea] px-4 py-3 text-sm text-[#756345]" role="alert"><span>{message}</span><button className="shrink-0 font-semibold underline underline-offset-2" disabled={disabled} onClick={retry}>Retry</button></div>
}
