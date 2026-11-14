"use client"

import { useEffect, useState } from "react"
import { useT } from "../../lib/i18n"
import type { TempleSummary } from "../../lib/temples"
import { TempleTrail } from "../../components/plan/TempleTrail"
import { DiscoveryChat } from "../../components/plan/DiscoveryChat"
import TempleFinder from "../../components/plan/TempleFinder"
import { EDIT_REQUEST } from "../../lib/planningSubmission"
import type { PlanningRequest } from "../../lib/planning"
import TripPlanner from "../../components/plan/TripPlanner"

type View = "discover" | "find" | "trip"

export function PlanClient({ temples: ALL }: { temples: TempleSummary[] }) {
  const { t } = useT()
  const [view, setView] = useState<View>("discover")
  const [restore, setRestore] = useState<PlanningRequest | null>(null)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(EDIT_REQUEST)
      if (!raw) return
      const r = JSON.parse(raw) as PlanningRequest
      if (!Array.isArray(r.temple_ids)) return
      setRestore(r)
      setSelected(r.temple_ids)
      setInitial(r.primary_temple_id || r.temple_ids[0])
      setView("trip")
      sessionStorage.removeItem(EDIT_REQUEST)
    } catch {}
  }, [])
  const [selected, setSelected] = useState<string[]>([])
  // Yadadri (T0001) is the deterministic reference/featured state — display
  // default only; any marker click replaces it, nothing is persisted.
  const [activeId, setActiveId] = useState<string | null>("T0001")
  const [initial, setInitial] = useState<string | null>(null)
  // guards double-activation while the trip view mounts
  const [navigating, setNavigating] = useState(false)

  // single shared selection — no duplicates, multi-select allowed
  function addTemple(id: string) {
    setSelected((s) => (s.includes(id) ? s : [...s, id]))
  }
  // ONE rule for every Continue button on this page: real selection +
  // navigation not already in flight.
  const selectedCount = selected.length
  const canContinue = selectedCount > 0 && !navigating
  function goTrip() {
    if (!canContinue) return
    setNavigating(true)
    setInitial(selected[0])
    setView("trip")
  }

  if (view === "find") {
    return (
      <TempleFinder
        temples={ALL}
        onPick={(id) => {
          addTemple(id)
          setInitial(id)
          setView("trip")
        }}
        onBack={() => {
          setNavigating(false)
          setView("discover")
        }}
      />
    )
  }
  if (view === "trip") {
    const primary =
      ALL.find((tm) => tm.templeId === initial) ||
      ALL.find((tm) => tm.templeId === selected[0]) ||
      ALL[0]
    return (
      <TripPlanner
        initialRequest={restore}
        temple={primary}
        selectedTemples={ALL.filter((tm) => selected.includes(tm.templeId))}
        onBack={() => {
          setNavigating(false)
          setView("discover")
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <header
        data-discovery-header
        className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl bg-[#fbf8f2]/95 py-2 backdrop-blur"
      >
        <div className="contents">
          <h1 className="col-start-1 row-start-1 min-w-0 font-serif text-[26px] font-bold leading-tight text-[#29251f] sm:text-4xl">
            {t("discover.titleLead")}{" "}
            <span className="text-[#b66a13]">{t("discover.titleAccent")}</span>
          </h1>
          <p className="col-span-2 row-start-2 text-sm text-[#796b5d]">
            {t("discover.subtitle").replace("{count}", String(ALL.length))}
          </p>
        </div>
        <div
          className="col-start-2 row-start-1 flex max-w-[170px] shrink-0 flex-col items-end gap-2 sm:max-w-none sm:flex-row sm:items-center sm:gap-4"
          data-top-continue
        >
          <p
            className="text-right text-xs font-semibold text-[#79440f]"
            aria-live="polite"
          >
            {t("discover.selectedCount").replace(
              "{count}",
              String(selectedCount),
            )}
          </p>
          <button
            type="button"
            onClick={goTrip}
            disabled={!canContinue}
            aria-label={t("discover.continue")}
            className="rounded-full bg-[#b66a13] px-5 py-3 text-sm font-semibold text-white disabled:opacity-45"
          >
            {t("discover.continue")} →
          </button>
        </div>
      </header>

      {/* trail (+ help banner) left · chat right — items-start keeps a
          bounded chat from stretching the map column (and vice versa) */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_368px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="h-[360px] sm:h-[400px] lg:h-[412px]">
            <TempleTrail
              temples={ALL}
              selectedIds={selected}
              activeId={activeId}
              onActivate={(id) => setActiveId(id || null)}
              onAdd={addTemple}
            />
          </div>

          {/* Entire help card opens the guided temple finder. */}
          <button
            type="button"
            onClick={() => setView("find")}
            className="group flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border border-[#e9d8c1] bg-[#fffdf9] px-5 py-4 text-left shadow-[0_4px_14px_rgba(41,37,31,0.05)] transition hover:border-[#d8bd91] hover:bg-[#fffaf1] hover:shadow-[0_8px_20px_rgba(41,37,31,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b66a13] focus-visible:ring-offset-2"
          >
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e8c9a0] bg-[#faf4e8]"
              aria-hidden="true"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#c2761b"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
                <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                <path d="M7.5 14h4M7.5 17.5h7" />
              </svg>
            </span>
            <span className="min-w-[180px] flex-1">
              <span className="block font-serif text-[17px] font-semibold text-[#29251f]">
                {t("discover.helpTitle")}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[#796b5d]">
                {t("discover.helpDesc")}
              </span>
            </span>
            <span
              className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-[#b66a13] transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          </button>
        </div>

        {/* bounded panel: the conversation scrolls INSIDE messages only —
            a long thread can never grow this wrapper (or the page) */}
        <div className="h-[440px] lg:h-[clamp(380px,calc(100dvh_-_220px),560px)]">
          <DiscoveryChat
            temples={ALL}
            selectedIds={selected}
            onAdd={addTemple}
          />
        </div>
      </div>

    </div>
  )
}
