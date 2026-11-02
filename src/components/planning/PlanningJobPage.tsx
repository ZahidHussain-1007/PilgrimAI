"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
import { planningFetch, type PlanningJob } from "../../lib/planning";
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
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const load = async () => {
      try {
        const next = await planningFetch<PlanningJob>("jobs/" + id, {
          signal: abort.signal,
        });
        if (disposed) return;
        setJob(next);
        setError("");
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(load, 1300);
        else router.replace("/itinerary/" + id); // actual terminal state, never a timer-based "success"
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : p("failure"));
          timer = setTimeout(load, 6000);
        }
      }
    };
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
      abort.abort();
    };
  }, [id, router, lang]);
  return (
    <div data-planning-page>
      {job ? (
        <PlanningExperience
          job={job}
          temples={temples}
          onCancel={async () => {
            try {
              await planningFetch("jobs/" + id, { method: "DELETE" });
              router.push("/plan");
            } catch (e) {
              setError(String(e));
            }
          }}
        />
      ) : (
        <div className="p-8" role="status">
          {p("queued")}
        </div>
      )}
      {error && (
        <div role="alert" className="p-5">
          {error}
          <Link className="ml-4 underline" href="/plan">
            {p("back")}
          </Link>
        </div>
      )}
    </div>
  );
}
