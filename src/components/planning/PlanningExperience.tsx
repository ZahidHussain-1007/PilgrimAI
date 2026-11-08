"use client";
import { useState } from "react";
import { TempleVideoPlayer, type VideoItem } from "../plan/TempleVideoPlayer";
import type { TempleSummary } from "../../lib/temples";
import { youtubeVideoId } from "../../lib/youtube";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
import type { PlanningJob } from "../../lib/planning";

export function PlanningExperience({
  job,
  temples,
  onCancel,
  fullscreen = false,
}: {
  fullscreen?: boolean;
  job: PlanningJob;
  temples: TempleSummary[];
  onCancel: () => void;
}) {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState<string[]>([]);
  const items: VideoItem[] = temples
    .filter((t) => job.request.temple_ids.includes(t.templeId))
    .flatMap<VideoItem>((t) => {
      if (t.videoFile)
        return [
          {
            templeId: t.templeId,
            videoId: "file:" + t.videoFile,
            fileUrl: t.videoFile,
            ytId: null,
            title: t.name,
            image: t.image,
          },
        ];
      return (t.videoUrls || (t.videoUrl ? [t.videoUrl] : [])).flatMap(
        (url) => {
          const yt = youtubeVideoId(url);
          return yt
            ? [
                {
                  templeId: t.templeId,
                  videoId: yt,
                  fileUrl: null,
                  ytId: yt,
                  title: t.name,
                  image: t.image,
                },
              ]
            : [];
        },
      );
    })
    .filter((x) => !failed.includes(x.videoId));
  const active = items[Math.min(index, Math.max(0, items.length - 1))];
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
  return (
    <section
      className={
        fullscreen
          ? "fixed inset-0 z-[100] overflow-hidden bg-black text-[#f8edda]"
          : "mx-auto max-w-[1180px] p-4 sm:p-7"
      }
      aria-live="polite"
      data-planning-experience
    >
      <header
        className={
          fullscreen
            ? "absolute bottom-24 left-1/2 z-20 flex w-[92vw] max-w-3xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/25 bg-[#211b15]/80 px-5 py-4 text-[#fff5e6] shadow-2xl backdrop-blur-sm motion-safe:animate-[planning-panel-in_350ms_ease-out]"
            : "mb-4 flex flex-wrap items-center justify-between gap-3"
        }
      >
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
      <div className={fullscreen ? "h-full w-full" : "space-y-4"}>
        <div
          className={
            fullscreen
              ? "absolute inset-0"
              : "min-w-0 overflow-hidden rounded-3xl border border-[#e8d6ba] bg-[#fffdf9] p-2 shadow-xl sm:p-3"
          }
        >
          <TempleVideoPlayer
            fillViewport={fullscreen}
            showControls={!fullscreen}
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
              setFailed((f) => [...f, id]);
              setIndex(0);
            }}
          />
        </div>
        <div
          className={
            fullscreen
              ? "sr-only"
              : "rounded-2xl border border-[#e8d6ba] bg-[#fffdf9] p-4"
          }
        >
          <h2 className="font-serif text-xl">{active?.title || p("title")}</h2>
          <p
            className={
              fullscreen
                ? "sr-only"
                : "mt-2 max-w-3xl text-sm leading-6 text-[#796b5d]"
            }
          >
            {p("waitBody")}
          </p>
          <ol className={fullscreen ? "sr-only" : "mt-4 flex flex-wrap gap-2"}>
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
    </section>
  );
}
