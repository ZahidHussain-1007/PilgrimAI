/**
 * Minimal rich-text parser for assistant replies.
 * Handles: **bold**, bare URLs (clickable), "- " / "• " bullet lines,
 * paragraph breaks on blank lines. Pure functions → unit-testable.
 * Touches no meaning: text outside markup passes through verbatim.
 */

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "link"; value: string; href: string }

export type RichBlock =
  | { kind: "paragraph"; tokens: InlineToken[] }
  | { kind: "list"; items: InlineToken[][] }

/** bold spans and bare URLs in one pass */
// audit C24: the URL class must not exclude `'` (e.g. Wikipedia's
// `Vemulawada_Raja_Rajeshwara_Temple`), which broke link rendering.
const INLINE_RE = /\*\*([^*]+)\*\*|(https?:\/\/[^\s<>"]+)/g
const BULLET_RE = /^\s*[-•*]\s+(.*)$/
const TRAILING_PUNCT = /[.,;:!?)\]}'’”]+$/

function parseInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  let match: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  while ((match = INLINE_RE.exec(line)) !== null) {
    if (match.index > last) {
      tokens.push({ kind: "text", value: line.slice(last, match.index) })
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: "bold", value: match[1] })
    } else {
      let url = match[2]
      let trail = ""
      while (TRAILING_PUNCT.test(url)) {
        trail = url.slice(-1) + trail
        url = url.slice(0, -1)
      }
      if (/^https?:\/\/[^\s/]{2,}/.test(url)) {
        tokens.push({ kind: "link", value: url, href: url })
        if (trail) tokens.push({ kind: "text", value: trail })
      } else {
        tokens.push({ kind: "text", value: url + trail })
      }
    }
    last = INLINE_RE.lastIndex
  }
  if (last < line.length) {
    tokens.push({ kind: "text", value: line.slice(last) })
  }
  return tokens
}

export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = []
  let list: InlineToken[][] | null = null

  const flushList = () => {
    if (list && list.length) blocks.push({ kind: "list", items: list })
    list = null
  }

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flushList()
      continue
    }
    const bullet = line.match(BULLET_RE)
    if (bullet) {
      if (!list) list = []
      list.push(parseInline(bullet[1]))
      continue
    }
    flushList()
    blocks.push({ kind: "paragraph", tokens: parseInline(line) })
  }
  flushList()
  return blocks
}
