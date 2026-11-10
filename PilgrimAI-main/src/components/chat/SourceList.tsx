import type { MessageSource } from "../../types/message"

export function SourceList({ sources }: { sources: MessageSource[] }) {
  if (!sources.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Sources">
      {sources.map((source, index) => {
        const safeHref =
          source.href &&
          (/^https?:\/\//i.test(source.href) || source.href.startsWith("/"))
        const chipClass =
          "inline-block max-w-[16rem] truncate rounded-lg border border-[#e9e2d6] px-2.5 py-1.5 text-xs text-[#79440f]"
        return (
          <li key={`${source.label}-${index}`}>
            {safeHref ? (
              <a
                className={`${chipClass} hover:bg-[#f6efe3] hover:border-[#d9c9ae]`}
                href={source.href}
                target={source.href?.startsWith("http") ? "_blank" : undefined}
                rel={
                  source.href?.startsWith("http") ? "noreferrer" : undefined
                }
                title={source.label}
              >
                {source.label}
              </a>
            ) : (
              <span className={chipClass} title={source.label}>
                {source.label}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
