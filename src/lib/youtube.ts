/**
 * v19: temple video helpers. Accepts youtu.be/ID, watch?v=ID, /shorts/ID,
 * /embed/ID and returns a privacy-friendly embed URL (youtube-nocookie).
 * FALLBACK is the shared SAMPLE video shown until a temple has its own
 * curated link (user provides one video per temple; dummy until then).
 */
export const FALLBACK_VIDEO_URL = "https://youtu.be/17ZGsk35W8U"

const ID_PATTERNS = [
  /youtu\.be\/([\w-]{6,})/,
  /[?&]v=([\w-]{6,})/,
  /\/shorts\/([\w-]{6,})/,
  /\/embed\/([\w-]{6,})/,
]

export function youtubeVideoId(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim()
  if (!raw) return null
  for (const pattern of ID_PATTERNS) {
    const match = raw.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export function youtubeEmbedUrl(
  url: string | null | undefined,
): string | null {
  const id = youtubeVideoId(url)
  if (!id) return null
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`
}

/** Canonical watch URL (external "Watch on YouTube" link). */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
