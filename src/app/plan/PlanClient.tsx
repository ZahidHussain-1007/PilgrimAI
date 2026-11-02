"use client"

import { useEffect,useState } from "react"
import { useT } from "../../lib/i18n"
import type { TempleSummary } from "../../lib/temples"
import { TempleTrail } from "../../components/plan/TempleTrail"
import { DiscoveryChat } from "../../components/plan/DiscoveryChat"
import { TempleBrowser } from "../../components/plan/TempleBrowser"
import TempleFinder from "../../components/plan/TempleFinder"
import {EDIT_REQUEST} from "../../lib/planningSubmission"
import type {PlanningRequest} from "../../lib/planning"
import TripPlanner from "../../components/plan/TripPlanner"

type View = "discover" | "find" | "trip"

export function PlanClient({ temples: ALL }: { temples: TempleSummary[] }) {
  const { t } = useT()
  const [view, setView] = useState<View>("discover")
  const [restore, setRestore] = useState<PlanningRequest | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(EDIT_REQUEST);
      if (!raw) return;
      const r = JSON.parse(raw) as PlanningRequest;
      if (!Array.isArray(r.temple_ids)) return;
      setRestore(r);
      setSelected(r.temple_ids);
      setInitial(r.primary_temple_id || r.temple_ids[0]);
      setView("trip");
      sessionStorage.removeItem(EDIT_REQUEST);
    } catch {}
  }, []);
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
  function removeTemple(id: string) {
    setSelected((s) => s.filter((x) => x !== id))
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

  const selectedTemples = ALL.filter((tm) => selected.includes(tm.templeId))

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {/* heading */}
      <div>
        <h1 className="font-serif text-3xl font-bold text-[#29251f] sm:text-4xl">
          {t("discover.titleLead")} <span className="text-[#b66a13]">{t("discover.titleAccent")}</span>
        </h1>
        <p className="mt-1.5 max-w-2xl font-serif text-sm italic text-[#796b5d]">
          {t("discover.subtitle").replace("{count}", String(ALL.length))}
        </p>
      </div>

      {/* sticky action toolbar — same selection state + handler as the
          bottom bar; pins below the app header inside .page-content */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-[#e9d8c1] bg-[#fbf8f2] px-4 py-2.5 shadow-[0_4px_14px_rgba(41,37,31,0.07)]">
        <p className="text-[13px] font-semibold text-[#79440f]">
          {t("discover.selectedCount").replace("{count}", String(selectedCount))}
        </p>
        {!canContinue && (
          <p className="text-[11.5px] text-[#9a8f7b]">{t("discover.selectHint")}</p>
        )}
        <button
          type="button"
          onClick={goTrip}
          disabled={!canContinue}
          aria-label={t("discover.continue")}
          className="ml-auto rounded-full bg-[#b66a13] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#99580d] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t("discover.continue")} →
        </button>
      </div>

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

          {/* help banner — opens the guided finder */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border border-[#e9d8c1] bg-[#fffdf9] px-5 py-4 shadow-[0_4px_14px_rgba(41,37,31,0.05)]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e8c9a0] bg-[#faf4e8]" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
                <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                <path d="M7.5 14h4M7.5 17.5h7" />
              </svg>
            </span>
            <div className="min-w-[180px] flex-1">
              <p className="font-serif text-[17px] font-semibold text-[#29251f]">{t("discover.helpTitle")}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[#796b5d]">{t("discover.helpDesc")}</p>
            </div>
            <button
              type="button"
              onClick={() => setView("find")}
              className="ml-auto shrink-0 rounded-full bg-[#b66a13] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#99580d]"
            >
              {t("discover.helpCta")} →
            </button>
          </div>
        </div>

        {/* bounded panel: the conversation scrolls INSIDE messages only —
            a long thread can never grow this wrapper (or the page) */}
        <div className="h-[440px] lg:h-[clamp(380px,calc(100dvh_-_220px),560px)]">
          <DiscoveryChat temples={ALL} selectedIds={selected} onAdd={addTemple} />
        </div>
      </div>

      {/* searchable list — every temple stays reachable */}
      <TempleBrowser temples={ALL} selectedIds={selected} onAdd={addTemple} />

      {/* bottom bar — always present; same goTrip + canContinue as the top
          toolbar so both buttons flip together with the shared selection */}
      <div className="rounded-[22px] border border-[#e2b26a] bg-[#f6efe3] p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-[13px] font-semibold text-[#79440f]">
            {t("discover.selectedCount").replace("{count}", String(selectedCount))}
          </p>
          {selectedCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedTemples.map((tm) => (
                <span
                  key={tm.templeId}
                  className="flex items-center gap-1.5 rounded-full border border-[#e9d8c1] bg-[#fffdf9] py-1 pl-3 pr-1.5 text-[12px] font-medium text-[#4a4436]"
                >
                  {tm.name}
                  <button
                    type="button"
                    onClick={() => removeTemple(tm.templeId)}
                    aria-label={t("discover.removeTemple")}
                    className="grid h-4 w-4 place-items-center rounded-full bg-[#e9d8c1] text-[10px] text-[#79440f] transition hover:bg-[#d9c3a0]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {!canContinue && (
            <p className="text-[11.5px] text-[#9a8f7b]">{t("discover.selectHint")}</p>
          )}
          <button
            type="button"
            onClick={goTrip}
            disabled={!canContinue}
            aria-label={t("discover.continue")}
            className="ml-auto rounded-full bg-[#b66a13] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#99580d] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t("discover.continue")}
          </button>
        </div>
      </div>
    </div>
  )
}
