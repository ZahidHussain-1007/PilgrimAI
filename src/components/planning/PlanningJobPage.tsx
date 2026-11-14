"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
import { planningFetch, type PlanningJob } from "../../lib/planning";
import {
  MIN_PLAYBACK_MS,
  PlanningPreviewGate,
} from "../../lib/planningPreview";
import {
  readSubmission,
  submitOnce,
  retrySubmission,
  previewJob,
  editRequest,
  cancelSubmission,
} from "../../lib/planningSubmission";
import type { TempleSummary } from "../../lib/temples";
import { PlanningExperience } from "./PlanningExperience";
import type { PlaybackState } from "../plan/TempleVideoPlayer";
export function PlanningJobPage({
  id,
  temples,
}: {
  id: string;
  temples: TempleSummary[];
}) {
  const router = useRouter();
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const [job, setJob] = useState<PlanningJob | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [resultReady, setResultReady] = useState(false),
    [playbackState, setPlaybackState] =
      useState<PlaybackState>("loading");
  const submission = id.startsWith("submit-");
  const gate = useRef(new PlanningPreviewGate());
  const mounted = useRef(false);
  const navigationPaused = useRef(false);
  const resultReadyRef = useRef(false);
  const readyJobId = useRef<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tryOpenReadyResult = useCallback(() => {
    if (
      !mounted.current ||
      navigationPaused.current ||
      !readyJobId.current
    )
      return false;
    const now = performance.now();
    return gate.current.navigateOnce(now, () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = null;
      router.replace("/itinerary/" + readyJobId.current);
    });
  }, [router]);

  const schedulePreviewCheck = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
    if (!mounted.current || !resultReadyRef.current) return;
    const now = performance.now();
    const playbackRemaining = gate.current.isPlaying()
      ? Math.max(
          0,
          MIN_PLAYBACK_MS - gate.current.playbackDuration(now),
        )
      : Infinity;
    const fallbackRemaining = gate.current.resultFallbackRemaining(now);
    const delay = Math.min(playbackRemaining, fallbackRemaining);
    previewTimer.current = setTimeout(() => {
      previewTimer.current = null;
      if (!tryOpenReadyResult()) schedulePreviewCheck();
    }, Math.max(0, delay));
  }, [tryOpenReadyResult]);

  const handlePlaybackStateChange = useCallback(
    (state: PlaybackState) => {
      gate.current.setPlaying(state === "playing", performance.now());
      setPlaybackState(state);
      if (!tryOpenReadyResult()) schedulePreviewCheck();
    },
    [schedulePreviewCheck, tryOpenReadyResult],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    let acceptedId: string | null = submission ? null : id;
    const record = submission ? readSubmission(id) : null;
    if (record) setJob(previewJob(record.request));
    const load = async () => {
      try {
        if (submission && !record) throw new Error("submissionMissing");
        const next = acceptedId
          ? await planningFetch<PlanningJob>("jobs/" + acceptedId, {
              signal: abort.signal,
            })
          : await (attempt ? retrySubmission(id) : submitOnce(id));
        if (disposed) return;
        setError("");
        if (!acceptedId) {
          acceptedId = next.id;
          // Native history keeps this mounted player alive while making reload resumable.
          window.history.replaceState(null, "", "/planning/" + next.id);
        }
        if (next.status === "queued" || next.status === "running") {
          setJob(next);
          timer = setTimeout(load, 1300);
          return;
        }
        if (
          (next.status === "completed" ||
            next.status === "needs_changes") &&
          next.result
        ) {
          setJob(next);
          readyJobId.current = next.id;
          gate.current.markResultReady(performance.now());
          resultReadyRef.current = true;
          setResultReady(true);
          if (!tryOpenReadyResult()) schedulePreviewCheck();
          return;
        }
        // Failed, cancelled, and malformed terminal jobs retain their existing
        // itinerary error handling and are never held behind the video preview.
        router.replace("/itinerary/" + next.id);
      } catch (e) {
        if (!disposed) {
          const code = e instanceof Error ? e.message : "failure";
          setError(
            [
              "overnightConflict",
              "submissionMissing",
              "validationFailure",
            ].includes(code)
              ? code
              : "submissionFailure",
          );
        }
      }
    };
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
      abort.abort();
    };
  }, [
    id,
    router,
    attempt,
    submission,
    schedulePreviewCheck,
    tryOpenReadyResult,
  ]);
  const edit = () => {
    try {
      if (job) editRequest(job.request);
    } catch {}
    router.push("/plan");
  };
  return (
    <main data-planning-page className="fixed inset-0 h-screen h-[100dvh] overflow-hidden bg-[#3b2a1d] text-[#f8edda]">
      {job ? (
        <PlanningExperience
          fullscreen
          job={job}
          temples={temples}
          resultReady={resultReady}
          playbackState={playbackState}
          onPlaybackStateChange={handlePlaybackStateChange}
          onCancel={async () => {
            navigationPaused.current = true;
            if (previewTimer.current) clearTimeout(previewTimer.current);
            previewTimer.current = null;
            try {
              if (submission) await cancelSubmission(id);
              else await planningFetch("jobs/" + id, { method: "DELETE" });
              gate.current.cancel();
              resultReadyRef.current = false;
              edit();
            } catch {
              navigationPaused.current = false;
              schedulePreviewCheck();
              setError("cancelFailure");
            }
          }}
        />
      ) : (
        <div className="p-6" role="status">
          <h1 className="font-serif text-2xl">{p("waiting")}</h1>
          <p>{p("submitting")}</p>
        </div>
      )}
      {error && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/65 p-4">
          <section
            role="alert"
            className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#d8c19d] bg-[#fffaf1] p-6 text-[#45382b] shadow-xl"
          >
            <h2 className="font-serif text-2xl">{p("needsAttention")}</h2>
            <p className="mt-3 break-words leading-7">{p(error)}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-[#ac6519] px-5 py-2 text-white"
                onClick={edit}
              >
                {p("editRequest")}
              </button>
              {![
                "overnightConflict",
                "submissionMissing",
                "validationFailure",
              ].includes(error) && (
                <button
                  className="rounded-full border border-[#d8c19d] px-5 py-2"
                  onClick={() => {
                    setError("");
                    setAttempt((a) => a + 1);
                  }}
                >
                  {p("retrySubmission")}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
