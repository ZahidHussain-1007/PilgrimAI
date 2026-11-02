"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
import { planningFetch, type PlanningJob } from "../../lib/planning";
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
    [attempt, setAttempt] = useState(0);
  const submission = id.startsWith("submit-");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const load = async () => {
      try {
        const record = submission ? readSubmission(id) : null;
        if (submission && !record) throw new Error("submissionMissing");
        if (record && !disposed) setJob(previewJob(record.request));
        const next = submission
          ? await (attempt ? retrySubmission(id) : submitOnce(id))
          : await planningFetch<PlanningJob>("jobs/" + id, {
              signal: abort.signal,
            });
        if (disposed) return;
        setJob(next);
        setError("");
        if (submission) {
          router.replace("/planning/" + next.id);
          return;
        }
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(load, 1300);
        else router.replace("/itinerary/" + next.id);
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
  }, [id, router, attempt, submission]);
  const edit = () => {
    try {
      if (job) editRequest(job.request);
    } catch {}
    router.push("/plan");
  };
  return (
    <main data-planning-page className="fixed inset-0 bg-black text-[#f8edda]">
      {job ? (
        <PlanningExperience
          fullscreen
          job={job}
          temples={temples}
          onCancel={async () => {
            try {
              if (submission) await cancelSubmission(id);
              else await planningFetch("jobs/" + id, { method: "DELETE" });
              edit();
            } catch {
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
