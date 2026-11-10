/**
 * audit S01 — OAuth callback `next` must be a same-origin RELATIVE path.
 * Raw `next=@evil.example` or `next=https://evil.example` would redirect
 * the signed-in user off-site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/chat"
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/chat"
  }
  if (next.includes("\\") || next.includes("@") || next.includes("\r") || next.includes("\n")) {
    return "/chat"
  }
  try {
    const base = new URL("http://local")
    const target = new URL(next, base)
    if (target.origin !== base.origin) return "/chat"
    return next
  } catch {
    return "/chat"
  }
}
