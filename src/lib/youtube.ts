/**
 * v19: temple video helpers. Accepts youtu.be/ID, watch?v=ID, /shorts/ID,
 * /embed/ID and returns a privacy-friendly embed URL (youtube-nocookie).
 *
 * v23.1: all 23 temples now ship their own `video_url`, so this constant is
 * no longer used by the player. It is kept as a last-resort reference and it
 * deliberately points at the real Yadadri clip (17ZGsk35W8U), not a dummy —
 * earlier comments calling it a "sample/dummy" were inaccurate.
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

export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  const id = youtubeVideoId(url)
  if (!id) return null
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`
}

/** Canonical watch URL (external "Watch on YouTube" link). */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Official IFrame embed parameters used by TempleVideoPlayer.
 *
 * Only variables YouTube still documents are set here. What each one
 * actually achieves — and what it does NOT — is recorded honestly:
 *
 *   autoplay: 1        muted autoplay (browsers block audible autoplay)
 *   mute: 1            required for autoplay to be allowed at all
 *   controls: 1        keeps YouTube's own accessible playback controls
 *   fs: 0              keeps the existing embedded-player fullscreen setting
 *   rel: 0             end-screen suggestions limited to the same channel
 *   playsinline: 1     iOS plays inline instead of forcing native fullscreen
 *   cc_load_policy: 0  captions are NOT loaded/forced on. This is a default,
 *                      not an override: a viewer who enabled captions in
 *                      their own YouTube account still gets them.
 *   iv_load_policy: 3  video annotations/cards off
 *
 * NOT included on purpose:
 *   modestbranding — retired by YouTube in August 2023 and now a no-op.
 *                    Setting it would imply a guarantee that no longer exists.
 *   vq / suggestedQuality / setPlaybackQuality — all no-ops since the
 *                    IFrame API revision of 24 Oct 2019. See
 *                    requestHighestVideoQuality() below.
 *
 * NOT POSSIBLE via the supported API (documented, not worked around):
 *   • hiding the video title / channel name overlay that appears on hover
 *     and at the start of playback (showinfo=0 was withdrawn in 2018)
 *   • hiding the YouTube watermark/logo
 *   • removing the large central play button when the video is paused
 *   • forcing a specific resolution such as 2160p
 *   • removing letterbox bars for non-16:9 uploads
 * Any of those would require CSS overlays/cropping or an oversized iframe,
 * which violates the YouTube Embedded Player policies, so they are not done.
 */
export const YOUTUBE_EMBED_PARAMS = {
  autoplay: 1,
  mute: 1,
  controls: 1,
  rel: 0,
  playsinline: 1,
  fs: 0,
  cc_load_policy: 0,
  iv_load_policy: 3,
} as const;

/**
 * Best-effort request only — and in practice a NO-OP.
 *
 * YouTube's IFrame API revision history (24 Oct 2019) states that
 * getPlaybackQuality, setPlaybackQuality and getAvailableQualityLevels are
 * no longer supported and that "calls to setPlaybackQuality will be no-op
 * functions… they will not actually have any impact on the viewer's
 * playback experience". The `vq=` embed parameter was retired at the same
 * time. There is currently no supported way to force a resolution.
 *
 * This function is retained because it is harmless and it reports whatever
 * quality YouTube actually chose (`onPlaybackQualityChange` / getPlaybackQuality
 * still report), which the player exposes as a data-quality attribute for
 * diagnostics. It must never be described as forcing HD/4K.
 */
export function requestHighestVideoQuality(player: {
  getAvailableQualityLevels?: () => string[];
  setPlaybackQuality?: (quality: string) => void;
  getPlaybackQuality?: () => string;
}): string {
  try {
    const offered = player.getAvailableQualityLevels?.() || [];
    const best = [
      "highres",
      "hd2160",
      "hd1440",
      "hd1080",
      "hd720",
      "large",
      "medium",
      "small",
      "tiny",
    ].find((q) => offered.includes(q));
    if (best) player.setPlaybackQuality?.(best);
    return player.getPlaybackQuality?.() || "adaptive";
  } catch {
    return "adaptive";
  }
}
