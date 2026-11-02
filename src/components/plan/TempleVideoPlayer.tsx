"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useT } from "../../lib/i18n"
import { youtubeWatchUrl } from "../../lib/youtube"

/** One playable entry of the temple playlist (owned file wins over YouTube). */
export type VideoItem = {
  templeId: string
  /** Stable identity used in the playlist: "file:/videos/x.webm" or YT id. */
  videoId: string
  /** Direct self-hosted footage (clean HTML5 playback), when available. */
  fileUrl: string | null
  /** YouTube id — only for entries without an owned file. */
  ytId: string | null
  title: string
  image: string | null
}

type Phase = "loading" | "playing" | "paused" | "blocked" | "empty"
type Engine = "html5" | "youtube" | "none"

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

/** Singleton YouTube IFrame API loader (shared across mounts). */
let ytPromise: Promise<any> | null = null
function loadYT(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytPromise) return ytPromise
  ytPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    script.async = true
    script.onerror = () => {
      ytPromise = null
      reject(new Error("YouTube API failed to load"))
    }
    document.head.appendChild(script)
  })
  return ytPromise
}

/**
 * Single-player temple video controller — dual engine.
 *
 * Owned/licensed file (public/videos/{id}.*) → clean HTML5 <video>:
 * no controls attribute, no title/channel UI, nothing but our fullscreen
 * button over the picture; object-fit cover fills the 16:9 frame.
 *
 * YouTube fallback (only when no owned file exists) → official IFrame API.
 * Provider hover UI (title/channel/playback flash) and source letterboxing
 * are provider/content-controlled there — not removable by our CSS.
 *
 * Shared behavior: muted autoplay, single → self-loop on ENDED, multi →
 * parent advances on ENDED (never a timer), one player at a time, manual
 * pause respected, form edits never restart, runtime errors drop the entry,
 * accessible play/pause lives OUTSIDE the picture, StrictMode-safe cleanup.
 *
 * Quality note: YouTube IFrame setPlaybackQuality is no longer honored —
 * playback is adaptive. No false claims.
 */
export function TempleVideoPlayer({
  items,
  index,
  onEnded,
  onPrev,
  onNext,
  onVideoError,
}: {
  items: VideoItem[]
  index: number
  onEnded: () => void
  onPrev: () => void
  onNext: () => void
  onVideoError: (videoId: string) => void
}) {
  const { t } = useT()
  const frameRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const ytRef = useRef<any>(null)
  const ytReadyRef = useRef(false)
  const ytCreatingRef = useRef(false)
  const ytGenRef = useRef(0)
  const loadedYtIdRef = useRef<string | null>(null)
  const gotPlayingRef = useRef(false)
  const attemptedRef = useRef(false)
  const callbacksRef = useRef({ onEnded, onPrev, onNext, onVideoError })
  callbacksRef.current = { onEnded, onPrev, onNext, onVideoError }

  const [phase, setPhase] = useState<Phase>(items.length ? "loading" : "empty")
  const [apiFailed, setApiFailed] = useState(false)
  const [isFs, setIsFs] = useState(false)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const current = items[index] ?? null
  const currentVideoId = current?.videoId ?? null
  const engine: Engine = !current ? "none" : current.fileUrl ? "html5" : "youtube"

  // ---- fullscreen state follows real fullscreen events -----------------
  useEffect(() => {
    const sync = () =>
      setIsFs(Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement))
    document.addEventListener("fullscreenchange", sync)
    document.addEventListener("webkitfullscreenchange", sync)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      document.removeEventListener("webkitfullscreenchange", sync)
    }
  }, [])

  // ---- YouTube engine helpers (generation-tokened, StrictMode-safe) -----
  const destroyYT = useCallback(() => {
    ytGenRef.current += 1
    try {
      ytRef.current?.destroy?.()
    } catch {}
    ytRef.current = null
    ytReadyRef.current = false
    ytCreatingRef.current = false
    loadedYtIdRef.current = null
    mountRef.current?.replaceChildren()
  }, [])

  const createYT = useCallback((videoId: string) => {
    const mount = mountRef.current
    if (!mount || ytCreatingRef.current || ytRef.current) return
    ytCreatingRef.current = true
    loadedYtIdRef.current = videoId
    attemptedRef.current = true
    gotPlayingRef.current = false
    const gen = ++ytGenRef.current
    const host = document.createElement("div")
    host.style.position = "absolute"
    host.style.inset = "0"
    mount.replaceChildren(host)

    loadYT()
      .then((YT) => {
        if (gen !== ytGenRef.current) return // superseded/destroyed
        ytRef.current = new YT.Player(host, {
          width: "100%",
          height: "100%",
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            disablekb: 1,
          },
          events: {
            onReady: (e: any) => {
              if (gen !== ytGenRef.current) return
              ytReadyRef.current = true
              ytCreatingRef.current = false
              const p = e.target
              try {
                p.mute()
              } catch {}
              attemptedRef.current = true
              gotPlayingRef.current = false
              try {
                p.playVideo()
              } catch {}
            },
            onStateChange: (e: any) => {
              if (gen !== ytGenRef.current) return
              const s = e.data
              if (s === 1) {
                gotPlayingRef.current = true
                setPhase("playing")
              } else if (s === 0) {
                if (itemsRef.current.length <= 1) {
                  try {
                    e.target.seekTo(0, true)
                    e.target.playVideo()
                  } catch {}
                } else {
                  callbacksRef.current.onEnded()
                }
              } else if (s === 2) {
                if (attemptedRef.current && !gotPlayingRef.current) setPhase("blocked")
                else if (gotPlayingRef.current) setPhase("paused")
              } else if (s === 5) {
                if (attemptedRef.current && !gotPlayingRef.current) setPhase("blocked")
              }
            },
            onError: (e: any) => {
              if (gen !== ytGenRef.current) return
              const vid = loadedYtIdRef.current
              // eslint-disable-next-line no-console
              console.warn("[TempleVideoPlayer] YT error code=", e.data, "videoId=", vid)
              if (vid) callbacksRef.current.onVideoError(vid)
            },
          },
        })
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[TempleVideoPlayer] init failed:", err)
        if (gen === ytGenRef.current) {
          ytCreatingRef.current = false
          setApiFailed(true)
        }
      })
  }, [])

  // ---- engine switch + playlist changes (single source of truth) -------
  useEffect(() => {
    if (engine === "none") {
      destroyYT()
      setPhase("empty")
      return
    }
    if (engine === "html5") {
      // hand the picture to <video>; events drive the phase
      destroyYT()
      return
    }
    // engine === "youtube"
    if (ytRef.current || ytCreatingRef.current) {
      if (loadedYtIdRef.current === currentVideoId) return
      loadedYtIdRef.current = currentVideoId
      attemptedRef.current = true
      gotPlayingRef.current = false
      setPhase("loading")
      if (ytReadyRef.current && ytRef.current) {
        try {
          ytRef.current.mute()
          ytRef.current.loadVideoById(currentVideoId)
        } catch {}
      }
      // not ready yet → onReady picks up loadedYtIdRef via a fresh call below
      if (ytCreatingRef.current && !ytReadyRef.current) {
        // creation in flight for a previous id — destroy and recreate cleanly
        destroyYT()
        createYT(currentVideoId as string)
      }
      return
    }
    createYT(currentVideoId as string)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, currentVideoId])

  // full teardown on unmount
  useEffect(() => () => destroyYT(), [destroyYT])

  // ---- HTML5 engine: explicit muted-autoplay attempt + blocked state ----
  useEffect(() => {
    if (engine !== "html5") return
    const v = videoRef.current
    if (!v) return
    attemptedRef.current = true
    gotPlayingRef.current = false
    setPhase("loading")
    const res = v.play()
    if (res && typeof res.catch === "function") {
      res.catch(() => {
        // autoplay refused → minimal play action shows OUTSIDE the picture
        if (videoRef.current === v && !gotPlayingRef.current) setPhase("blocked")
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, currentVideoId])

  const handleEnded = useCallback(() => {
    const v = videoRef.current
    if (itemsRef.current.length <= 1) {
      // single temple → repeat continuously (no native loop attr: playlist
      // advance must stay possible if a sibling video is added later)
      if (v) {
        try {
          v.currentTime = 0
          void v.play()?.catch?.(() => {})
        } catch {}
      }
      return
    }
    callbacksRef.current.onEnded()
  }, [])

  const handleFileError = useCallback(() => {
    const vid = currentVideoId
    if (vid) callbacksRef.current.onVideoError(vid)
  }, [currentVideoId])

  /** Play/pause — OUTSIDE the picture, works for both engines. */
  const togglePlay = useCallback(() => {
    if (engine === "html5") {
      const v = videoRef.current
      if (!v) return
      try {
        if (!v.paused) {
          v.pause()
          return
        }
        attemptedRef.current = true
        void v.play()?.catch?.(() => {
          if (videoRef.current === v) setPhase("blocked")
        })
      } catch {}
      return
    }
    const p = ytRef.current
    if (!p || !ytReadyRef.current) return
    try {
      if (engine === "youtube" && phase === "playing") {
        p.pauseVideo()
        return
      }
      attemptedRef.current = true
      p.playVideo()
    } catch {}
  }, [engine, phase])

  /** Only application control on the picture: fullscreen, state-synced. */
  const toggleFullscreen = useCallback(() => {
    const el = frameRef.current
    if (!el) return
    try {
      const doc = document as any
      const active = document.fullscreenElement || doc.webkitFullscreenElement
      if (active) {
        const exit = document.exitFullscreen?.() || doc.webkitExitFullscreen?.()
        exit?.catch?.(() => {})
        return
      }
      const req = el.requestFullscreen || (el as any).webkitRequestFullscreen
      if (!req) return
      const res = req.call(el)
      res?.catch?.(() => {}) // graceful failure (permissions / mobile)
    } catch {
      /* graceful failure */
    }
  }, [])

  const many = items.length > 1
  const isPlaying = phase === "playing"
  const showControls = Boolean(current) && !(engine === "youtube" && apiFailed)

  return (
    <div>
      {/* ============ picture: video + fullscreen button only ============ */}
      <div
        ref={frameRef}
        className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_10px_30px_rgba(41,37,31,0.16)]"
        data-playback={engine === "youtube" && apiFailed ? "error" : phase}
        data-engine={engine}
        data-video-id={currentVideoId ?? ""}
      >
        {/* owned/licensed footage → clean HTML5 player (no controls attr) */}
        {engine === "html5" && current?.fileUrl && (
          <video
            key={current.videoId}
            ref={videoRef}
            src={current.fileUrl}
            autoPlay
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full border-0 object-cover"
            onPlaying={() => {
              gotPlayingRef.current = true
              setPhase("playing")
            }}
            onPause={() => {
              if (gotPlayingRef.current && videoRef.current?.ended === false) setPhase("paused")
            }}
            onEnded={handleEnded}
            onError={handleFileError}
          />
        )}

        {/* YouTube fallback host (DOM owned by the API, isolated from React) */}
        {engine === "youtube" && (
          <div
            ref={mountRef}
            className="absolute inset-0 [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
          />
        )}

        {/* fullscreen — the ONLY overlay control on the picture */}
        {engine !== "none" && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFs ? t("plan.fullscreenExit") : t("plan.fullscreenEnter")}
            aria-pressed={isFs}
            className="absolute right-2.5 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            {isFs ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
              </svg>
            )}
          </button>
        )}

        {/* loading — no dark layer over the picture, just a spinner */}
        {phase === "loading" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="spinner !h-7 !w-7 !border-white/30 !border-t-white" aria-hidden="true" />
          </div>
        )}

        {/* nothing playable at all (no picture exists to obstruct) */}
        {phase === "empty" && (
          <div className="absolute inset-0 grid place-items-center bg-[#241b12] px-6 text-center">
            <div className="max-w-sm">
              <p className="font-serif text-base font-semibold text-[#f3e4c9]">{t("plan.noVideosTitle")}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[#cbb99a]">{t("plan.noVideosBody")}</p>
            </div>
          </div>
        )}

        {/* YouTube API failed → informative fallback (no playback possible) */}
        {apiFailed && engine === "youtube" && current && (
          <div className="absolute inset-0 grid place-items-center bg-[#241b12]/92 px-6 text-center">
            <div className="max-w-sm">
              <p className="font-serif text-base font-semibold text-[#f3e4c9]">{t("plan.videoUnavailable")}</p>
              <a
                href={youtubeWatchUrl(current.ytId ?? "")}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-full bg-[#b66a13] px-5 py-2 text-xs font-semibold text-white hover:bg-[#99580d]"
              >
                {t("plan.watchVideo")}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ==== outside-the-picture controls (never cover the video) ====== */}
      {showControls && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2" data-player-controls>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? t("plan.pauseVideo") : t("plan.playVideo")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e9d8c1] bg-white px-3 py-1.5 text-xs font-semibold text-[#79440f] transition hover:bg-[#faf4e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b66a13]/30"
          >
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            )}
            {isPlaying ? t("plan.pauseVideo") : t("plan.playVideo")}
          </button>

          {many && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onPrev}
                aria-label={t("plan.prev")}
                className="grid h-7 w-7 place-items-center rounded-lg border border-[#e9d8c1] bg-white text-[#79440f] transition hover:bg-[#faf4e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b66a13]/30"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M15.5 5.5v13L7 12z" />
                  <rect x="5" y="5.5" width="2.2" height="13" rx="1" />
                </svg>
              </button>
              <span className="min-w-[52px] text-center text-[11px] font-semibold tabular-nums text-[#796b5d]">
                {t("plan.videoOf")
                  .replace("{i}", String(index + 1))
                  .replace("{n}", String(items.length))}
              </span>
              <button
                type="button"
                onClick={onNext}
                aria-label={t("plan.next")}
                className="grid h-7 w-7 place-items-center rounded-lg border border-[#e9d8c1] bg-white text-[#79440f] transition hover:bg-[#faf4e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b66a13]/30"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8.5 5.5v13L17 12z" />
                  <rect x="16.8" y="5.5" width="2.2" height="13" rx="1" />
                </svg>
              </button>
            </div>
          )}

          {current?.ytId && (
            <a
              href={youtubeWatchUrl(current.ytId)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11px] font-semibold text-[#b66a13] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b66a13]/30"
            >
              {t("plan.watchOnYoutube")}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
