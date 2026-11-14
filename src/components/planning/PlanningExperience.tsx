"use client";
import { useState } from "react";
import {
  TempleVideoPlayer,
  type PlaybackState,
  type VideoItem,
} from "../plan/TempleVideoPlayer";
import type { TempleSummary } from "../../lib/temples";
import { youtubeVideoId, youtubeWatchUrl } from "../../lib/youtube";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
import type { PlanningJob } from "../../lib/planning";

export function PlanningExperience({
  job,
  temples,
  onCancel,
  resultReady = false,
  playbackState = "loading",
  onPlaybackStateChange,
  fullscreen = false,
}: {
  fullscreen?: boolean;
  job: PlanningJob;
  temples: TempleSummary[];
  onCancel: () => void;
  resultReady?: boolean;
  playbackState?: PlaybackState;
  onPlaybackStateChange?: (state: PlaybackState) => void;
}) {
  const { lang, t } = useT();
  const p = (k: string) => planningT(lang, k);
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState<string[]>([]),
    [recoveryVideo, setRecoveryVideo] = useState<VideoItem | null>(null);
  const selectedTemples = temples
    .filter((t) => job.request.temple_ids.includes(t.templeId))
    .sort((a, b) => {
      if (a.templeId === b.templeId) return 0;
      if (a.templeId === job.request.primary_temple_id) return -1;
      if (b.templeId === job.request.primary_temple_id) return 1;
      return (
        job.request.temple_ids.indexOf(a.templeId) -
        job.request.temple_ids.indexOf(b.templeId)
      );
    });
  const items: VideoItem[] = selectedTemples
    .flatMap<VideoItem>((t) => {
      if (t.videoFile) {
        return [
          {
            templeId: t.templeId,
            videoId: `file:${t.videoFile}`,
            fileUrl: t.videoFile,
            ytId: null,
            title: t.name,
            image: t.image,
          },
        ];
      }
      const sources = (t.videoUrls || (t.videoUrl ? [t.videoUrl] : [])).flatMap(
        (url) => {
          const ytId = youtubeVideoId(url);
          return ytId ? [{ ytId, watchUrl: youtubeWatchUrl(ytId) }] : [];
        },
      );
      return sources.map(({ ytId, watchUrl }) => ({
        templeId: t.templeId,
        videoId: ytId,
        fileUrl: null,
        ytId,
        watchUrl,
        title: t.name,
        image: t.image,
      }));
    })
    .filter((x) => !failed.includes(x.videoId));
  const active =
    items[Math.min(index, Math.max(0, items.length - 1))];
  const activeTemple = selectedTemples.find(
    (temple) => temple.templeId === active?.templeId,
  );
  const location = [activeTemple?.city, activeTemple?.district]
    .filter(Boolean)
    .join(", ");
  const stages = [
    "queued",
    "temples",
    "stay_food",
    "routes",
    "schedule",
    "budget",
    "validate",
  ];
  const current = stages.indexOf(job.stage);
  const player = (
    <TempleVideoPlayer
      fillViewport={fullscreen}
      showControls={!fullscreen}
      hideProviderControls={fullscreen}
      items={items}
      index={Math.min(index, Math.max(0, items.length - 1))}
      onEnded={() =>
        setIndex((i) => (items.length ? (i + 1) % items.length : 0))
      }
      onNext={() =>
        setIndex((i) => (items.length ? (i + 1) % items.length : 0))
      }
      onPrev={() =>
        setIndex((i) =>
          items.length ? (i - 1 + items.length) % items.length : 0,
        )
      }
      onVideoError={(id) => {
        setRecoveryVideo(items.find((item) => item.videoId === id) || null);
        setFailed((f) => [...f, id]);
      }}
      onPlaybackStateChange={(state) => {
        if (state === "playing") setRecoveryVideo(null);
        onPlaybackStateChange?.(state);
      }}
    />
  );
  return (
    <section
      className={
        fullscreen
          ? "fixed inset-0 z-[100] h-screen h-[100dvh] overflow-hidden bg-[#3b2a1d] text-[#f8edda]"
          : "mx-auto max-w-[1180px] p-4 sm:p-7"
      }
      aria-live="polite"
      data-planning-experience
    >
      {fullscreen ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-0 h-full w-full">
            <div className="pointer-events-auto absolute inset-0 h-full w-full">
              {player}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 z-20">
            <div className="absolute left-5 top-16 w-[min(72vw,34rem)] text-[#fff5e6] [text-shadow:0_2px_5px_rgba(0,0,0,.95)] sm:left-8 sm:w-[min(48vw,34rem)] md:top-56 lg:left-10 lg:w-[min(34vw,28rem)]">
              <p className="text-[10px] uppercase tracking-[.24em] text-[#f1d7ad] sm:text-[11px]">
                PilgrimAI
              </p>
              <h1 className="mt-1.5 max-w-[min(76vw,34rem)] break-words font-serif text-[clamp(1.45rem,2.7vw,2.65rem)] font-medium leading-[1.08] [overflow-wrap:anywhere] sm:mt-2 lg:max-w-[min(34vw,28rem)]">
                {active?.title || p("title")}
              </h1>
              {location && (
                <p className="mt-1 break-words text-xs text-[#fff0d6] sm:mt-2 sm:text-sm">
                  {location}
                </p>
              )}
            </div>
            <section data-planning-status className="pointer-events-auto absolute left-1/2 top-56 w-[min(640px,calc(100%-32px))] -translate-x-1/2 text-center text-[#fff5e6] [text-shadow:0_3px_5px_rgba(0,0,0,1),0_0_2px_rgba(0,0,0,1)] md:top-[clamp(60px,8vh,96px)]">
              <div className="flex flex-col items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-5 w-5 shrink-0 place-items-center"
                >
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-[#f0c36d]" />
                </span>
                <div className="min-w-0">
                  <h2 className="break-words font-sans text-[clamp(1.4rem,3vw,2.5rem)] font-bold leading-tight text-[#FBBF24]">
                    {p("planningHeading")}
                  </h2>
                  <p
                    className="mt-2 text-sm font-medium leading-5 text-[#fff7df] sm:text-base"
                    role="status"
                  >
                    {resultReady ? p("readyOpening") : p(job.stage)}
                  </p>
                  {!resultReady &&
                    (playbackState === "blocked" ||
                      playbackState === "failed" ||
                      playbackState === "empty") && (
                      <p className="mt-1 text-xs leading-5 text-[#f1d7ad]">
                        {p(
                          playbackState === "blocked"
                            ? "videoBlocked"
                            : "videoRecovery",
                        )}
                      </p>
                    )}
                  {!resultReady &&
                    (playbackState === "failed" ||
                      playbackState === "empty") &&
                    recoveryVideo?.ytId && (
                      <a
                        className="mt-1 inline-block text-xs font-semibold text-[#f1d7ad] underline underline-offset-2"
                        href={`https://www.youtube.com/watch?v=${recoveryVideo.ytId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("plan.watchOnYoutube")}
                      </a>
                    )}
                </div>
              </div>
              <button
                onClick={onCancel}
                className="mt-3 min-h-9 rounded-full border border-[#fff0d6]/80 bg-transparent px-4 py-1.5 text-xs font-semibold text-[#fff5e6] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5b762]"
              >
                {p("cancel")}
              </button>
            </section>
          </div>
        </>
      ) : (
        <>
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[.2em] text-[#a66621]">
                PilgrimAI
              </p>
              <h1 className="mt-1 font-serif text-xl sm:text-2xl">
                {p("waiting")}
              </h1>
              <p className="mt-2 text-xs text-[#d5b785]" role="status">
                {p(job.stage)}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="rounded-full border border-[#d8c19d] px-5 py-2 text-sm"
            >
              {p("cancel")}
            </button>
          </header>
          <div className="space-y-4">
            <div className="min-w-0 overflow-hidden rounded-3xl border border-[#e8d6ba] bg-[#fffdf9] p-2 shadow-xl sm:p-3">
              {player}
            </div>
            <div className="rounded-2xl border border-[#e8d6ba] bg-[#fffdf9] p-4">
              <h2 className="font-serif text-xl">
                {active?.title || p("title")}
              </h2>
              {location && (
                <p className="mt-1 text-sm text-[#796b5d]">{location}</p>
              )}
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#796b5d]">
                {p("waitBody")}
              </p>
              <ol className="mt-4 flex flex-wrap gap-2">
                {stages.map((s, i) => (
                  <li
                    key={s}
                    aria-current={s === job.stage ? "step" : undefined}
                    className={`rounded-full px-3 py-2 text-xs ${i === current ? "bg-[#ac6519] text-white" : i < current ? "bg-[#eee5d3] text-[#514833]" : "border border-[#e8d6ba] text-[#8d8271]"}`}
                  >
                    {i < current ? "• " : ""}
                    {p(s)}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
