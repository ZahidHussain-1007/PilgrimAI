"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TempleSummary } from "../../lib/temples";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
import {
  planningFetch,
  platformLinks,
  safeUrl,
  calendarText,
  type PlanningJob,
  type PlanningRequest,
} from "../../lib/planning";
import { PlanningExperience } from "./PlanningExperience";

const box = "rounded-2xl border border-[#e8d9c2] bg-[#fffdf9] p-5";
const button =
  "rounded-full border border-[#d7b98d] px-4 py-2 text-sm font-semibold text-[#82501c] disabled:opacity-40";
function Facts({ value }: { value: unknown }) {
  const { lang } = useT();
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const url = safeUrl(value);
    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-[#9c5e19] underline"
      >
        {value}
      </a>
    ) : (
      <span className="whitespace-pre-line break-words">
        {planningT(lang, value)}
      </span>
    );
  }
  if (Array.isArray(value))
    return (
      <ul className="ml-4 list-disc space-y-2">
        {value.map((v, i) => (
          <li key={i}>
            <Facts value={v} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold">{k.replace(/_/g, " ")}</dt>
            <dd className="pl-3">
              <Facts value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}
export function ItineraryWorkspace({
  id,
  temples,
}: {
  id: string;
  temples: TempleSummary[];
}) {
  const { lang } = useT();
  const p = (key: string) => planningT(lang, key);
  const router = useRouter();
  const [job, setJob] = useState<PlanningJob | null>(null),
    [error, setError] = useState(""),
    [day, setDay] = useState(0),
    [calendar, setCalendar] = useState(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState<
      { role: string; text: string; evidence?: unknown }[]
    >([]),
    [proposal, setProposal] = useState<Record<string, unknown> | null>(null),
    [draft, setDraft] = useState<PlanningRequest | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setJob(null);
    setError("");
    setMessages([]);
    setProposal(null);
    setDraft(null);
    setDay(0);
    const load = async () => {
      try {
        const next = await planningFetch<PlanningJob>("jobs/" + id);
        if (cancelled) return;
        setJob(next);
        setMessages(next.history || []);
        setError("");
        if (!["queued", "running"].includes(next.status)) {
          try {
            localStorage.removeItem("pilgrim:active_plan");
          } catch {}
          return;
        }
        timer = setTimeout(load, 1300);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          timer = setTimeout(load, 6000);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);
  const download = () => {
    if (!job) return;
    const url = URL.createObjectURL(
      new Blob([calendarText(job)], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `pilgrimai-${id}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const ask = async (changes?: Record<string, unknown>, confirm = false) => {
    if (!job || busy) return;
    const text = changes ? p("edit") : message.trim();
    if (!text && !confirm) return;
    setBusy(true);
    setError("");
    if (!changes && !confirm) {
      setMessages((m) => [...m, { role: "user", text }]);
      setMessage("");
    }
    try {
      const response = await planningFetch<{
        kind: string;
        content?: string;
        changes?: Record<string, unknown>;
        job?: PlanningJob;
        evidence?: unknown;
      }>(`jobs/${id}/chat`, {
        method: "POST",
        body: JSON.stringify({
          message: text || p("apply"),
          base_version: job.version,
          changes: changes || {},
          confirm,
        }),
      });
      if (response.kind === "proposal") {
        setProposal(response.changes || {});
        setMessages((m) => [...m, { role: "assistant", text: p("proposal") }]);
      } else if (response.kind === "revision" && response.job) {
        setProposal(null);
        router.push("/itinerary/" + response.job.id);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: response.content || "",
            evidence: response.evidence,
          },
        ]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!job)
    return (
      <div className="p-8" role="status">
        {error || p("queued")}
      </div>
    );
  if (["queued", "running"].includes(job.status))
    return (
      <>
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
        {error && (
          <p role="alert" className="p-4">
            {error}
          </p>
        )}
      </>
    );
  if (!job.result)
    return (
      <section className="p-8">
        <h1 className="font-serif text-3xl">{p("failure")}</h1>
        <p role="alert" className="my-4">
          {job.error || job.status}
        </p>
        <Link href="/plan" className={button}>
          {p("back")}
        </Link>
      </section>
    );
  const result = job.result,
    selectedDay =
      result.days[Math.min(day, Math.max(0, result.days.length - 1))];
  const links = platformLinks(
    job.request.origin,
    result.temples[0]?.name || "Telangana",
  );
  return (
    <article
      className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-7"
      data-itinerary-workspace
    >
      <header className="border-b border-[#e8d9c2] pb-5">
        <div className="flex flex-wrap gap-2 text-xs text-[#9c6726]">
          <span>{p("draft")}</span>
          <span>· v{job.version}</span>
          <span>· {p("saved")}</span>
        </div>
        <h1 className="mt-3 font-serif text-3xl leading-tight">
          {result.title}
        </h1>
        <p className="mt-2 text-sm text-[#796b5d]">
          {job.request.start_date} · {job.request.days} {p("days")} ·{" "}
          {job.request.origin} · IST
        </p>
        <p className="mt-2 text-xs text-[#796b5d]">{p("savedNotice")}</p>
        <p className="mt-2 text-xs text-[#796b5d]">{p("sourceNotice")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/plan" className={button}>
            {p("back")}
          </Link>
          <Link href="/itinerary" className={button}>
            {p("savedPlans")}
          </Link>
          {job.parent && (
            <Link href={"/itinerary/" + job.parent} className={button}>
              {p("original")}
            </Link>
          )}
          <button
            className={button}
            onClick={download}
            disabled={!result.days.length}
          >
            {p("export")}
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className={box + " text-red-800"}>
          {error}
        </p>
      )}
      {result.conflicts.length > 0 && (
        <section className={box + " border-[#c87543]"} role="alert">
          <h2 className="font-serif text-xl">{p("conflicts")}</h2>
          <p className="mt-2 text-sm leading-6">{p("conflictHelp")}</p>
          <Facts value={result.conflicts} />
        </section>
      )}
      <section className={box}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-serif text-xl">{p("timeline")}</h2>
          <button
            className={button}
            aria-pressed={calendar}
            onClick={() => setCalendar((v) => !v)}
          >
            {p("calendar")}
          </button>
        </div>
        <nav className="my-4 flex flex-wrap gap-2" aria-label={p("calendar")}>
          {result.days.map((d, i) => (
            <button
              className={button + (i === day ? " bg-[#f4e7d0]" : "")}
              aria-pressed={i === day}
              key={d.date}
              onClick={() => setDay(i)}
            >
              {new Date(d.date + "T12:00:00+05:30").toLocaleDateString(
                lang === "te" ? "te-IN" : lang === "hi" ? "hi-IN" : "en-IN",
                { weekday: "short", day: "numeric", month: "short" },
              )}
            </button>
          ))}
        </nav>
        {calendar && (
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {result.days.map((d, i) => (
              <button
                key={d.date}
                onClick={() => setDay(i)}
                className="rounded-xl border border-[#e8d9c2] p-4 text-left"
              >
                <strong>{d.date}</strong>
                {d.items
                  .filter((x) => x.type === "visit")
                  .map((x) => (
                    <p key={x.place_id} className="mt-2 text-xs">
                      {x.start} · {x.title}
                    </p>
                  ))}
              </button>
            ))}
          </div>
        )}
        {selectedDay?.items.length === 0 && (
          <p className="py-6 text-sm text-[#796b5d]">{p("freeDay")}</p>
        )}
        <ol className="space-y-3">
          {selectedDay?.items.map((item, i) => (
            <li key={i} className="flex gap-4 rounded-xl bg-[#faf5ec] p-4">
              <time className="w-24 shrink-0 text-xs font-semibold text-[#a56520]">
                {item.start}–{item.end}
              </time>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{p(item.title)}</h3>
                <p className="mt-1 text-xs text-[#796b5d]">
                  {item.duration_minutes} min
                  {item.distance_km !== undefined
                    ? ` · ${item.distance_km} km`
                    : ""}
                  {item.source ? " · " + item.source : ""}
                </p>
                {safeUrl(item.url) && (
                  <a
                    href={safeUrl(item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-[#9c5e19] underline"
                  >
                    Google Maps ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className={box}>
        <h2 className="font-serif text-xl">{p("budgetTitle")}</h2>
        <p className="mt-2 text-sm">
          {p("total")}:{" "}
          <strong>
            ₹{result.budget.low.toLocaleString("en-IN")}–₹
            {result.budget.high.toLocaleString("en-IN")}
          </strong>
        </p>
        {result.budget.components.map((c) => (
          <div key={c.name} className="mt-3 rounded-xl bg-[#faf5ec] p-3">
            <p className="font-semibold">
              {p(c.name)} · ₹{c.low}–₹{c.high}
            </p>
            <p className="text-xs leading-5 text-[#796b5d]">
              {p(
                c.name === "vehicle_fuel"
                  ? "fuelBasis"
                  : c.name === "food"
                    ? "foodBasis"
                    : "stayBasis",
              )}
            </p>
          </div>
        ))}
        <h3 className="mt-4 font-semibold">{p("missing")}</h3>
        <Facts value={result.budget.missing} />
      </section>
      <section className={box}>
        <h2 className="font-serif text-xl">{p("links")}</h2>
        <p className="my-3 text-sm leading-6 text-[#796b5d]">
          {p("searchNotice")}
        </p>
        <p className="mb-3 text-sm">
          {job.request.origin} → {result.temples.map((t) => t.name).join(" → ")}{" "}
          · {job.request.start_date}
        </p>
        <div className="flex flex-wrap gap-2">
          {links
            .filter(
              (l) =>
                l.kind === "map" ||
                l.kind === "hotel" ||
                l.kind === job.request.transport,
            )
            .map((l) => (
              <a
                className={button}
                href={l.url}
                key={l.name}
                target="_blank"
                rel="noopener noreferrer"
              >
                {l.name} ↗
              </a>
            ))}
        </div>
      </section>
      <section className={box}>
        <h2 className="font-serif text-xl">{p("options")}</h2>
        {["hotels", "restaurants"].map((key) => (
          <div key={key} className="mt-4 grid gap-3 sm:grid-cols-2">
            {result.options[key as "hotels" | "restaurants"].map((o, i) => (
              <div key={i} className="min-w-0 rounded-xl bg-[#faf5ec] p-4">
                <h3 className="font-semibold">{String(o.name || "")}</h3>
                <p className="my-2 text-xs">
                  {String(o.price_range || "")} · {p("unknown")}
                </p>
                {safeUrl(o.maps_url) && (
                  <a
                    href={safeUrl(o.maps_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline"
                  >
                    Google Maps ↗
                  </a>
                )}
                {Boolean(o.booking_links) &&
                  typeof o.booking_links === "object" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(o.booking_links || {}).map(
                        ([name, url]) =>
                          safeUrl(url) && (
                            <a
                              key={name}
                              href={safeUrl(url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs underline"
                            >
                              {name} ↗
                            </a>
                          ),
                      )}
                    </div>
                  )}
              </div>
            ))}
          </div>
        ))}
      </section>
      {job.request.include_attractions && (
        <section className={box}>
          <h2 className="font-serif text-xl">{p("nearby")}</h2>
          {result.temples.map((tm) => (
            <div key={tm.id} className="mt-4">
              <h3 className="font-semibold">{tm.name}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {tm.nearby.map((n) => (
                  <a
                    key={n.name}
                    href={safeUrl(n.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={button}
                  >
                    {n.name} ↗
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <details className={box}>
        <summary className="cursor-pointer font-serif text-xl">
          {p("details")}
        </summary>
        {result.temples.map((tm) => (
          <section className="mt-5 border-t border-[#e8d9c2] pt-4" key={tm.id}>
            <h3 className="mb-3 font-serif text-xl">{tm.name}</h3>
            <p className="mb-3 text-sm text-[#796b5d]">{tm.hours_basis}</p>
            <Facts value={tm.facts} />
          </section>
        ))}
      </details>
      <details className={box}>
        <summary className="cursor-pointer font-serif text-xl">
          {p("assumptions")}
        </summary>
        <div className="mt-3 text-sm leading-6">
          <Facts value={result.warnings} />
        </div>
      </details>
      <details className={box}>
        <summary className="cursor-pointer font-serif text-xl">
          {p("agents")}
        </summary>
        <Facts value={result.agent_trace} />
        <p className="mt-3 text-xs">
          {result.algorithm} · {result.elapsed_seconds}s
        </p>
      </details>
      <section className={box}>
        <h2 className="font-serif text-2xl">{p("chat")}</h2>
        <p className="mt-2 text-sm leading-6 text-[#796b5d]">{p("chatHint")}</p>
        <div
          ref={scroller}
          className="my-4 max-h-80 space-y-3 overflow-y-auto"
          data-itinerary-chat
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                "max-w-[95%] whitespace-pre-wrap break-words rounded-xl p-3 text-sm " +
                (m.role === "user"
                  ? "ml-auto bg-[#b66a13] text-white"
                  : "bg-[#f5edde]")
              }
            >
              {p(m.text)}
              {m.evidence !== undefined && (
                <div className="mt-3 max-h-64 overflow-y-auto">
                  <Facts value={m.evidence} />
                </div>
              )}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
          className="flex gap-2"
        >
          <input
            aria-label={p("chat")}
            className="min-w-0 flex-1 rounded-xl border border-[#dfcaab] p-3"
            maxLength={800}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
          />
          <button className={button} disabled={busy || !message.trim()}>
            {p("send")}
          </button>
        </form>
        {proposal && (
          <div className="mt-4 rounded-xl border border-[#d3ae75] p-4">
            <h3 className="font-semibold">{p("proposal")}</h3>
            <Facts value={proposal} />
            <button
              className={button + " mt-3"}
              disabled={busy}
              onClick={() => void ask(proposal, true)}
            >
              {p("apply")}
            </button>
          </div>
        )}
        <details
          className="mt-5"
          onToggle={(e) => {
            if (e.currentTarget.open && !draft) setDraft({ ...job.request });
          }}
        >
          <summary className="cursor-pointer font-semibold text-[#9c5e19]">
            {p("edit")}
          </summary>
          {draft && (
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(draft);
              }}
            >
              {(
                [
                  "origin",
                  "start_date",
                  "days",
                  "departure",
                  "finish",
                  "adults",
                  "children",
                  "elderly",
                  "budget_cap",
                  "rooms",
                  "visit_minutes",
                  "rest_minutes",
                ] as const
              ).map((key) => (
                <label key={key} className="text-sm">
                  {p(
                    (
                      {
                        start_date: "date",
                        budget_cap: "budgetCap",
                        visit_minutes: "visit",
                        rest_minutes: "rest",
                      } as Record<string, string>
                    )[key] || key,
                  )}
                  <input
                    className="mt-1 block w-full rounded-xl border border-[#dfcaab] p-2"
                    type={
                      key === "start_date"
                        ? "date"
                        : key === "departure" || key === "finish"
                          ? "time"
                          : key === "origin"
                            ? "text"
                            : "number"
                    }
                    required={key !== "budget_cap"}
                    min={
                      [
                        "adults",
                        "children",
                        "elderly",
                        "rest_minutes",
                      ].includes(key)
                        ? 0
                        : 1
                    }
                    value={draft[key] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [key]: [
                          "origin",
                          "start_date",
                          "departure",
                          "finish",
                        ].includes(key)
                          ? e.target.value
                          : e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
              {(
                ["transport", "stay", "food", "special", "budget_tier"] as const
              ).map((key) => (
                <label key={key}>
                  {p(key)}
                  <select
                    className="mt-1 block w-full rounded-xl border border-[#dfcaab] p-2"
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  >
                    {(key === "transport"
                      ? ["car", "bus", "train", "taxi"]
                      : key === "stay"
                        ? ["none", "hotel", "guest", "dham"]
                        : key === "food"
                          ? ["veg", "nonveg", "jain", "any"]
                          : key === "special"
                            ? ["none", "wheel", "elder", "medical"]
                            : ["low", "mid", "high"]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {p(v)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="sm:col-span-2 flex flex-wrap gap-3">
                {temples.map((tm) => (
                  <label key={tm.templeId} className="text-xs">
                    <input
                      type="checkbox"
                      checked={draft.temple_ids.includes(tm.templeId)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          temple_ids: e.target.checked
                            ? [...draft.temple_ids, tm.templeId]
                            : draft.temple_ids.filter(
                                (id) => id !== tm.templeId,
                              ),
                        })
                      }
                    />{" "}
                    {tm.name}
                  </label>
                ))}
              </div>
              <fieldset className="sm:col-span-2 flex flex-wrap gap-3">
                <legend>{p("priorities")}</legend>
                {["darshan", "family", "history", "shakti", "quick"].map(
                  (key) => (
                    <label key={key} className="text-sm">
                      <input
                        type="checkbox"
                        checked={draft.priorities.includes(key)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            priorities: e.target.checked
                              ? [...draft.priorities, key]
                              : draft.priorities.filter((k) => k !== key),
                          })
                        }
                      />{" "}
                      {p(key)}
                    </label>
                  ),
                )}
              </fieldset>
              {(["include_attractions", "allow_estimates"] as const).map(
                (k) => (
                  <label key={k} className="text-sm">
                    <input
                      type="checkbox"
                      checked={draft[k]}
                      onChange={(e) =>
                        setDraft({ ...draft, [k]: e.target.checked })
                      }
                    />{" "}
                    {p(k === "allow_estimates" ? "estimates" : "include")}
                  </label>
                ),
              )}
              <button className={button} disabled={busy}>
                {p("proposal")}
              </button>
            </form>
          )}
        </details>
      </section>
    </article>
  );
}
