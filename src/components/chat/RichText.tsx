import { parseRichText, type InlineToken } from "../../lib/richText"

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        if (token.kind === "bold") {
          return (
            <strong key={index} className="font-semibold">
              {token.value}
            </strong>
          )
        }
        if (token.kind === "link") {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noreferrer"
              className="break-all rounded text-[#79440f] underline underline-offset-2 hover:bg-[#f6efe3] hover:text-[#aa6418]"
            >
              {token.value}
            </a>
          )
        }
        return <span key={index}>{token.value}</span>
      })}
    </>
  )
}

/** Renders assistant replies: paragraphs, bulleted lists, bold, clickable links. */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseRichText(text)
  return (
    <div className={`space-y-2 text-sm leading-6 ${className}`}>
      {blocks.map((block, index) =>
        block.kind === "list" ? (
          <ul
            key={index}
            className="list-disc space-y-1 pl-5 marker:text-[#aa6418]"
          >
            {block.items.map((tokens, itemIndex) => (
              <li key={itemIndex}>
                <Inline tokens={tokens} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inline tokens={block.tokens} />
          </p>
        ),
      )}
    </div>
  )
}
