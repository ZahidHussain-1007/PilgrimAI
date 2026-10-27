import type { MessageSource } from "../../types/message"
export function SourceList({ sources }: { sources: MessageSource[] }) {
  if (!sources.length) return null
  return <ul className="mt-3 flex flex-wrap gap-2" aria-label="Sources">{sources.map((source, index) => { const safeHref = source.href && (/^https?:\/\//i.test(source.href) || source.href.startsWith("/")); return <li key={`${source.label}-${index}`}>{safeHref ? <a className="rounded-lg border border-[#e9e2d6] px-2.5 py-1.5 text-xs text-[#79440f] hover:bg-[#f6efe3]" href={source.href} target={source.href?.startsWith("http") ? "_blank" : undefined} rel={source.href?.startsWith("http") ? "noreferrer" : undefined}>{source.label}</a> : <span className="rounded-lg border border-[#e9e2d6] px-2.5 py-1.5 text-xs text-[#79440f]">{source.label}</span>}</li> })}</ul>
}
