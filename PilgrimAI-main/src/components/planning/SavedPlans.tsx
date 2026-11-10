"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { planningFetch, type PlanningJob } from "../../lib/planning";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
export function SavedPlans() {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const [jobs, setJobs] = useState<PlanningJob[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    planningFetch<PlanningJob[]>("jobs")
      .then((j) => {
        if (active) setJobs(j);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="space-y-4 p-5">
      <h1 className="font-serif text-3xl">{p("savedPlans")}</h1>
      <p className="text-sm text-[#796b5d]">{p("savedNotice")}</p>
      {error && <p role="alert">{error}</p>}
      {jobs?.length === 0 && <p>{p("empty")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {jobs?.map((j) => (
          <Link
            key={j.id}
            href={"/itinerary/" + j.id}
            className="rounded-2xl border border-[#e3d1b4] bg-[#fffdf9] p-5"
          >
            <h2 className="font-serif text-xl">{j.title}</h2>
            <p className="mt-2 text-xs text-[#796b5d]">
              {new Date(j.created_at).toLocaleDateString()} ·{" "}
              {p(j.status === "needs_changes" ? "needs_changes" : j.stage)}
            </p>
            <p className="mt-3 text-sm font-semibold text-[#a66823]">
              {p("view")} →
            </p>
          </Link>
        ))}
      </div>
      <Link
        href="/plan"
        className="inline-block rounded-full bg-[#aa6418] px-5 py-3 text-white"
      >
        {p("back")}
      </Link>
    </section>
  );
}
