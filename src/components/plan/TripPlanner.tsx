"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { planningFetch, type PlanningJob } from "../../lib/planning"
import { planningT } from "../../lib/planningCopy"
import type { TempleSummary } from "../../lib/temples"
import { youtubeVideoId } from "../../lib/youtube"
import { useT } from "../../lib/i18n"
import { TempleVideoPlayer, type VideoItem } from "./TempleVideoPlayer"

/** Real coordinates for common starting cities — distance is only shown
 *  when the typed origin matches a known city (no invented numbers). */
const ORIGIN_COORDS: Record<string, [number, number]> = {
  hyderabad: [17.385, 78.4867],
  secunderabad: [17.4435, 78.489],
  warangal: [17.9689, 79.594],
  hanumakonda: [17.9891, 79.5362],
  khammam: [17.2473, 80.1514],
  nalgonda: [17.0575, 79.268],
  karimnagar: [18.4386, 79.1288],
  mahbubnagar: [16.7488, 77.983],
  nizamabad: [18.6725, 78.0941],
  ramagundam: [18.7596, 79.4765],
  siddipet: [18.1018, 78.8521],
  adilabad: [19.6641, 78.532],
  sangareddy: [17.6284, 78.0916],
  medak: [18.0453, 78.2608],
  jagtial: [18.7896, 78.9147],
  kothagudem: [17.5547, 80.6197],
  vijayawada: [16.5062, 80.648],
}

function distanceKm(origin: string, lat: number, lon: number): number | null {
  const key = origin.trim().toLowerCase()
  const home = ORIGIN_COORDS[key]
  if (!home || !lat || !lon) return null
  const R = 6371
  const dLat = ((lat - home[0]) * Math.PI) / 180
  const dLon = ((lon - home[1]) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((home[0] * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(km * 10) / 10 // straight-line distance, never a road claim
}

const PRIORITIES = [
  { key: "darshan", labelKey: "plan.pDarshan" },
  { key: "family", labelKey: "plan.pFamily" },
  { key: "history", labelKey: "plan.pHistory" },
  { key: "shakti", labelKey: "plan.pShakti" },
  { key: "quick", labelKey: "plan.pQuick" },
]
const TRANSPORT = [
  { v: "car", labelKey: "plan.transportCar" },
  { v: "bus", labelKey: "plan.transportBus" },
  { v: "train", labelKey: "plan.transportTrain" },
  { v: "taxi", labelKey: "plan.transportTaxi" },
]
const STAY = [
  { v: "none", labelKey: "plan.accomNone" },
  { v: "hotel", labelKey: "plan.accomHotel" },
  { v: "guest", labelKey: "plan.accomGuest" },
  { v: "dham", labelKey: "plan.accomDham" },
]
const FOOD = [
  { v: "veg", labelKey: "plan.foodVeg" },
  { v: "nonveg", labelKey: "plan.foodNonVeg" },
  { v: "jain", labelKey: "plan.foodJain" },
  { v: "any", labelKey: "plan.foodAny" },
]
const SPECIAL = [
  { v: "none", labelKey: "plan.specialNone" },
  { v: "wheel", labelKey: "plan.specialWheel" },
  { v: "elder", labelKey: "plan.specialElder" },
  { v: "medical", labelKey: "plan.specialMedical" },
]

/** Trip details page: cinematic temple video + temple info on the LEFT,
 *  "Plan Your Journey" form on the RIGHT (target composition). */
export default function TripPlanner({
  temple,
  selectedTemples,
  onBack,
}: {
  temple: TempleSummary
  selectedTemples?: TempleSummary[]
  onBack: () => void
}) {
  const { t, lang } = useT()
  const router = useRouter()
  const p = (key: string) => planningT(lang, key)

  // ---- selection / playlist ------------------------------------------
  const selected = useMemo<TempleSummary[]>(
    () => (selectedTemples && selectedTemples.length ? selectedTemples : [temple]),
    [selectedTemples, temple],
  )
  const playable = useMemo<VideoItem[]>(() => {
    const list = selected
      .flatMap((tm): VideoItem[] => {
        if (tm.videoFile) return [{templeId:tm.templeId,videoId:`file:${tm.videoFile}`,fileUrl:tm.videoFile,ytId:null,title:tm.name,image:tm.image}]
        return (tm.videoUrls || (tm.videoUrl ? [tm.videoUrl] : [])).flatMap(url => {
          const yt = youtubeVideoId(url)
          return yt ? [{templeId:tm.templeId,videoId:yt,fileUrl:null,ytId:yt,title:tm.name,image:tm.image}] : []
        })
      })
    // the primary (featured) temple plays first — badge starts at 1 of N
    const at = list.findIndex((x) => x.templeId === temple.templeId)
    if (at > 0) return [list[at], ...list.slice(0, at), ...list.slice(at + 1)]
    return list
  }, [selected, temple])
  const [vidx, setVidx] = useState(() =>
    Math.max(
      0,
      playable.findIndex((p) => p.templeId === temple.templeId),
    ),
  )
  const [failedIds, setFailedIds] = useState<string[]>([])
  const items = useMemo(
    () => playable.filter((p) => !failedIds.includes(p.videoId)),
    [playable, failedIds],
  )
  // clamp when entries drop out (runtime embed errors) — never a fake skip loop
  useEffect(() => {
    setVidx((i) => (items.length ? Math.min(i, items.length - 1) : 0))
  }, [items.length])

  const safeIdx = items.length ? Math.min(vidx, items.length - 1) : 0
  const activeTempleId = items[safeIdx]?.templeId ?? temple.templeId
  const activeTemple = selected.find((tm) => tm.templeId === activeTempleId) ?? temple
  const others = selected.filter((tm) => tm.templeId !== activeTempleId)
  const advance = (dir: 1 | -1) =>
    setVidx((i) => (items.length <= 1 ? 0 : (i + dir + items.length) % items.length))

  // ---- form state (preserved fields + new preferences) ----------------
  const [origin, setOrigin] = useState("")
  const [date, setDate] = useState("")
  const [days, setDays] = useState("1")
  const [budget, setBudget] = useState("mid")
  const [people, setPeople] = useState("2")
  const [priorities, setPriorities] = useState<string[]>(["darshan"])
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [elderly, setElderly] = useState(0)
  const [transport, setTransport] = useState("car")
  const [stay, setStay] = useState("none")
  const [food, setFood] = useState("veg")
  const [special, setSpecial] = useState("none")
  const [prefsOpen, setPrefsOpen] = useState(true)
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState("")
  const [departure, setDeparture] = useState("07:00")
  const [finish, setFinish] = useState("21:00")
  const [budgetCap, setBudgetCap] = useState("")
  const [rooms, setRooms] = useState(1)
  const [visitMinutes, setVisitMinutes] = useState(75)
  const [restMinutes, setRestMinutes] = useState(15)
  const [allowEstimates, setAllowEstimates] = useState(false)
  const [includeAttractions, setIncludeAttractions] = useState(false)

  const total = Number(people)
  const compositionOk = adults + children + elderly === total

  const togglePriority = (k: string) =>
    setPriorities((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!compositionOk || planning) return
    setPlanError("")
    setPlanning(true)
    try {
      const job = await planningFetch<PlanningJob>("jobs", { method: "POST", body: JSON.stringify({
        temple_ids: selected.map(tm => tm.templeId), origin, start_date: date, days: Number(days),
        departure, finish, budget_cap: budgetCap ? Number(budgetCap) : null,
        adults, children, elderly, transport, stay, food, special,
        budget_tier: budget === "premium" ? "high" : budget, rooms, visit_minutes: visitMinutes,
        rest_minutes: restMinutes, priorities, include_attractions: includeAttractions,
        language: lang, allow_estimates: allowEstimates,
      }) })
      try { localStorage.setItem("pilgrim:active_plan", job.id) } catch {}
      router.push("/itinerary/" + job.id)
    } catch (error) { setPlanError(error instanceof Error ? error.message : p("failure")); setPlanning(false) }
  }

  // ---- real highlights strip (only sourced values) --------------------
  const strip: { icon: "pin" | "clock" | "type"; value: string; label: string }[] = []
  const km = distanceKm(origin, activeTemple.lat, activeTemple.lon)
  if (km != null) {
    strip.push({
      icon: "pin",
      value: t("plan.distFrom")
        .replace("{km}", String(km))
        .replace("{city}", origin.trim()),
      label: p("straightLine"),
    })
  }
  if (activeTemple.darshanHours) {
    strip.push({ icon: "clock", value: activeTemple.darshanHours, label: t("plan.stripDarshan") })
  }
  if (activeTemple.category) {
    strip.push({
      icon: "type",
      value: activeTemple.category.split("(")[0].trim(),
      label: t("plan.stripType"),
    })
  }

  const inputCls =
    "mt-1.5 h-[44px] w-full rounded-xl border border-[#e9d8c1] bg-white px-3 text-sm text-[#29251f] outline-none transition focus:border-[#b66a13] focus:ring-2 focus:ring-[#b66a13]/15"
  const labelRow = "flex items-center gap-1.5 text-[13px] font-medium text-[#5c5544]"

  return (
    <div className="px-5 py-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#b66a13] hover:underline"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        {t("plan.backToTemples")}
      </button>

      <div className="grid items-start gap-6 lg:grid-cols-[57fr_43fr]">
        {/* ================= LEFT: heading · video · info · strip · others */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#79440f]">
            {t("plan.step")}
          </p>
          <h1 className="mt-1.5 font-serif text-[27px] font-bold leading-tight text-[#29251f] sm:text-[30px]">
            {t("plan.title")} <span className="text-[#b66a13]">{temple.name}</span>
          </h1>
          <p className="mt-1.5 font-serif text-sm italic text-[#796b5d]">{t("plan.subtitle")}</p>

          {selected.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selected.map((tm) => (
                <span
                  key={tm.templeId}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    tm.templeId === activeTempleId
                      ? "border-[#b66a13] bg-[#f5e9d7] text-[#79440f]"
                      : "border-[#e9d8c1] bg-white text-[#796b5d]"
                  }`}
                >
                  {tm.name}
                </span>
              ))}
            </div>
          )}

          {/* large cinematic player */}
          <div className="mt-4">
            <TempleVideoPlayer
              items={items}
              index={safeIdx}
              onEnded={() => advance(1)}
              onPrev={() => advance(-1)}
              onNext={() => advance(1)}
              onVideoError={(id) => setFailedIds((f) => (f.includes(id) ? f : [...f, id]))}
            />
          </div>

          {/* active temple information (synced with playback) */}
          <div className="mt-4 flex gap-4 rounded-[20px] border border-[#e9d8c1] bg-[#fffdf9] p-4">
            <div className="relative grid h-[148px] w-[148px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#f5e9d7] text-[#c99a58]">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 20V10l8-7 8 7v10" /><path d="M9 20v-6h6v6" />
              </svg>
              {activeTemple.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeTemple.image}
                  alt={activeTemple.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-[21px] font-bold leading-tight text-[#29251f]">
                {activeTemple.name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[#796b5d]">
                <span className="inline-flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="2" aria-hidden="true">
                    <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21z" />
                    <circle cx="12" cy="10.4" r="2.4" />
                  </svg>
                  {[activeTemple.city, activeTemple.district].filter(Boolean).join(", ")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="1.8" aria-hidden="true">
                    <path d="M4 20V10l8-7 8 7v10" /><path d="M9 20v-6h6v6" />
                  </svg>
                  {activeTemple.deity}
                </span>
              </div>
              {(activeTemple.rating != null || activeTemple.reviewCount != null) && (
                <div className="mt-2 flex items-center gap-2 text-[12px] text-[#796b5d]">
                  {activeTemple.rating != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f5e9d7] px-2.5 py-1 font-semibold text-[#79440f]">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#c2761b" aria-hidden="true">
                        <path d="M12 2l2.9 6.3 6.8.8-5 4.6 1.3 6.8L12 17.3 5.9 20.5 7.2 13.7 2.2 9.1l6.8-.8z" />
                      </svg>
                      {activeTemple.rating}
                    </span>
                  )}
                  {activeTemple.reviewCount != null && (
                    <span>{activeTemple.reviewCount} reviews</span>
                  )}
                </div>
              )}
              {activeTemple.summary && (
                <p className="mt-2.5 line-clamp-4 text-[12.5px] leading-relaxed text-[#796b5d]">
                  {activeTemple.summary}
                </p>
              )}
            </div>
          </div>

          {/* real-data highlights strip */}
          {strip.length > 0 && (
            <div className="mt-3 flex divide-x divide-[#efe6d4] overflow-hidden rounded-[18px] border border-[#e9d8c1] bg-[#fffdf9]">
              {strip.map((s, i) => (
                <div key={i} className="flex min-w-0 flex-1 items-start gap-2.5 px-4 py-3.5">
                  <span className="mt-0.5 shrink-0 text-[#c2761b]" aria-hidden="true">
                    {s.icon === "pin" && (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21z" />
                        <circle cx="12" cy="10.4" r="2.4" />
                      </svg>
                    )}
                    {s.icon === "clock" && (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                        <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" />
                      </svg>
                    )}
                    {s.icon === "type" && (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M4 20V10l8-7 8 7v10" /><path d="M9 20v-6h6v6" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-[#29251f]">{s.value}</span>
                    <span className="mt-0.5 block text-[11px] text-[#9a8f7b]">{s.label}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* other selected temples */}
          {others.length > 0 && (
            <div className="mt-5">
              <h3 className="font-serif text-lg font-semibold text-[#29251f]">
                {t("plan.otherTemples")}
              </h3>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                {others.map((tm) => {
                  const vid = youtubeVideoId(tm.videoUrl)
                  const fileId = tm.videoFile ? `file:${tm.videoFile}` : null
                  const isFailed = fileId
                    ? failedIds.includes(fileId)
                    : vid
                      ? failedIds.includes(vid)
                      : false
                  const playableCard = Boolean(fileId || vid) && !isFailed
                  return (
                    <article
                      key={tm.templeId}
                      className="flex gap-3 rounded-2xl border border-[#e9d8c1] bg-[#fffdf9] p-3"
                    >
                      <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f5e9d7] text-[#c99a58]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M4 20V10l8-7 8 7v10" /><path d="M9 20v-6h6v6" />
                        </svg>
                        {tm.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tm.image}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none"
                            }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-[#29251f]">{tm.name}</p>
                        <p className="truncate text-[11.5px] text-[#796b5d]">
                          {[tm.city, tm.district].filter(Boolean).join(", ")}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[#9a8f7b]">
                          {tm.summary || tm.deity}
                        </p>
                        {playableCard ? (
                          <button
                            type="button"
                            onClick={() => {
                              const idx = items.findIndex((p) => p.templeId === tm.templeId)
                              if (idx >= 0) setVidx(idx)
                            }}
                            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#e0b26a] px-3 py-1 text-[11px] font-semibold text-[#b66a13] transition hover:bg-[#f5e9d7]"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
                            {t("plan.watchVideo")}
                          </button>
                        ) : (
                          <span className="mt-1.5 inline-block rounded-full border border-[#e9d8c1] bg-[#f7f2e7] px-3 py-1 text-[11px] font-medium text-[#9a8f7b]">
                            {t("plan.videoUnavailable")}
                          </span>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ================= RIGHT: Plan Your Journey form ================= */}
        <form onSubmit={submit} className="min-w-0 rounded-[20px] border border-[#e9d8c1] bg-[#fffdf9] p-5 shadow-[0_6px_24px_rgba(41,37,31,0.05)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#eeddc4] bg-[#faf4e8] text-[#c2761b]" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
                <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
              </svg>
            </span>
            <div>
              <h2 className="font-serif text-[21px] font-bold text-[#29251f]">{t("plan.journeyTitle")}</h2>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[#796b5d]">{t("plan.journeySub")}</p>
            </div>
          </div>

          {/* essential inputs */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelRow}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="2" aria-hidden="true">
                  <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21z" />
                  <circle cx="12" cy="10.4" r="2.4" />
                </svg>
                {t("plan.startingCity")} <span className="text-[#c2511f]">*</span>
              </span>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className={inputCls}
                required
              />
            </label>
            <label className="block">
              <span className={labelRow}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
                  <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                </svg>
                {t("plan.date")} <span className="text-[#c2511f]">*</span>
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
                required
              />
            </label>
            <label className="block">
              <span className={labelRow}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M7 3h10M7 21h10M8 3c0 4 8 4 8 9s-8 5-8 9M16 3c0 4-8 4-8 9s8 5 8 9" />
                </svg>
                {t("plan.duration")} <span className="text-[#c2511f]">*</span>
              </span>
              <select value={days} onChange={(e) => setDays(e.target.value)} className={inputCls}>
                {["1", "2", "3", "4", "5", "6", "7"].map((d) => (
                  <option key={d} value={d}>
                    {t("plan.daysValue").replace("{n}", d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelRow}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
                  <circle cx="17" cy="9" r="2.6" /><path d="M16 14.6c2.8.2 5 2.2 5 4.9" />
                </svg>
                {t("plan.people")} <span className="text-[#c2511f]">*</span>
              </span>
              <select value={people} onChange={(e) => setPeople(e.target.value)} className={inputCls}>
                {["1", "2", "3", "4", "5", "6", "8", "10"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>

          {/* budget */}
          <div className="mt-5">
            <span className={labelRow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="1.8" aria-hidden="true">
                <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
                <path d="M4.5 6.5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5M4.5 11.5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5" />
              </svg>
              {t("plan.budget")}
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { k: "low", label: t("plan.budgetLow"), icon: "leaf" },
                { k: "mid", label: t("plan.budgetMid"), icon: "check" },
                { k: "premium", label: t("plan.budgetHigh"), icon: "crown" },
              ].map((b) => (
                <button
                  key={b.k}
                  type="button"
                  onClick={() => setBudget(b.k)}
                  aria-pressed={budget === b.k}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-[12.5px] font-semibold transition ${
                    budget === b.k
                      ? "border-[#b66a13] bg-[#b66a13] text-white shadow-[0_6px_16px_rgba(182,106,19,0.28)]"
                      : "border-[#e5b978] bg-white text-[#79440f] hover:bg-[#faf4e8]"
                  }`}
                >
                  {b.icon === "leaf" && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M5 19c8 1 14-4 14-14-8 0-14 4-14 11z" /><path d="M5 19c3-5 7-8 11-9" />
                    </svg>
                  )}
                  {b.icon === "check" && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                  {b.icon === "crown" && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 18h16l1.5-10-5 4L12 5 7.5 12l-5-4z" />
                    </svg>
                  )}
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* additional preferences — collapsible, expanded by default */}
          <div className="mt-5 rounded-2xl border border-[#eeddc4] bg-[#faf5ea]">
            <button
              type="button"
              onClick={() => setPrefsOpen((o) => !o)}
              aria-expanded={prefsOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c2761b" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 3.5l1.2 2.2 2.5-.4 .6 2.4 2.2 1.2-1.2 2.1 1.2 2.1-2.2 1.2-.6 2.4-2.5-.4L12 20.5l-1.2-2.2-2.5.4-.6-2.4-2.2-1.2 1.2-2.1-1.2-2.1 2.2-1.2.6-2.4 2.5.4z" strokeLinejoin="round" />
              </svg>
              <span className="font-serif text-[15.5px] font-semibold text-[#29251f]">
                {t("plan.preferencesTitle")}
              </span>
              <span className="text-[12px] italic text-[#9a8f7b]">{t("plan.preferencesOptional")}</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9a8156" strokeWidth="2.4" strokeLinecap="round"
                className={`ml-auto transition-transform ${prefsOpen ? "" : "-rotate-180"}`}
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {prefsOpen && (
              <div className="grid gap-4 border-t border-[#eeddc4] px-4 py-4 sm:grid-cols-2">
                {/* traveller composition — validated against total */}
                <div>
                  <span className={labelRow}>{t("plan.compositionLabel")}</span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {[
                      { label: t("plan.adults"), value: adults, set: setAdults },
                      { label: t("plan.children"), value: children, set: setChildren },
                      { label: t("plan.elderly"), value: elderly, set: setElderly },
                    ].map((c) => (
                      <label key={c.label} className="block">
                        <span className="block text-[10.5px] text-[#9a8f7b]">{c.label}</span>
                        <select
                          value={c.value}
                          onChange={(e) => c.set(Number(e.target.value))}
                          aria-label={c.label}
                          className="h-9 w-full rounded-lg border border-[#e9d8c1] bg-white px-1.5 text-[12.5px] outline-none focus:border-[#b66a13]"
                        >
                          {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {!compositionOk && (
                    <p role="alert" className="mt-1.5 text-[11px] font-medium text-[#b0442a]">
                      {t("plan.compositionError").replace("{count}", String(total))}
                    </p>
                  )}
                </div>

                <label className="block">
                  <span className={labelRow}>{t("plan.transport")}</span>
                  <select value={transport} onChange={(e) => setTransport(e.target.value)} className={inputCls}>
                    {TRANSPORT.map((o) => (
                      <option key={o.v} value={o.v}>{t(o.labelKey)}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelRow}>{t("plan.accommodation")}</span>
                  <select value={stay} onChange={(e) => setStay(e.target.value)} className={inputCls}>
                    {STAY.map((o) => (
                      <option key={o.v} value={o.v}>{t(o.labelKey)}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelRow}>{t("plan.food")}</span>
                  <select value={food} onChange={(e) => setFood(e.target.value)} className={inputCls}>
                    {FOOD.map((o) => (
                      <option key={o.v} value={o.v}>{t(o.labelKey)}</option>
                    ))}
                  </select>
                </label>

                {/* travel interests (existing priorities state, multi-select) */}
                <div className="sm:col-span-2">
                  <span className={labelRow}>{t("plan.interests")}</span>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => togglePriority(p.key)}
                        aria-pressed={priorities.includes(p.key)}
                        className={`rounded-full border px-3.5 py-1.5 text-[12px] transition ${
                          priorities.includes(p.key)
                            ? "border-[#b66a13] bg-[#f5e9d7] font-semibold text-[#79440f]"
                            : "border-[#e9d8c1] bg-white text-[#796b5d] hover:bg-[#faf6ee]"
                        }`}
                      >
                        {t(p.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block sm:col-span-2">
                  <span className={labelRow}>{t("plan.special")}</span>
                  <select value={special} onChange={(e) => setSpecial(e.target.value)} className={inputCls}>
                    {SPECIAL.map((o) => (
                      <option key={o.v} value={o.v}>{t(o.labelKey)}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <fieldset className="mt-5 grid gap-4 rounded-2xl border border-[#e9d8c1] p-4 sm:grid-cols-2">
            <legend className="px-2 font-serif font-semibold">{p("calendar")}</legend>
            <label className="text-sm">{p("departure")}<input type="time" required value={departure} onChange={e=>setDeparture(e.target.value)} className={inputCls}/></label>
            <label className="text-sm">{p("finish")}<input type="time" required value={finish} onChange={e=>setFinish(e.target.value)} className={inputCls}/></label>
            <label className="text-sm">{p("budgetCap")}<input type="number" min="1" max="10000000" value={budgetCap} onChange={e=>setBudgetCap(e.target.value)} className={inputCls}/></label>
            <label className="text-sm">{p("rooms")}<input type="number" required min="1" max="30" value={rooms} onChange={e=>setRooms(Number(e.target.value))} className={inputCls}/></label>
            <label className="text-sm">{p("visit")}<input type="number" required min="30" max="240" value={visitMinutes} onChange={e=>setVisitMinutes(Number(e.target.value))} className={inputCls}/></label>
            <label className="text-sm">{p("rest")}<input type="number" required min="0" max="90" value={restMinutes} onChange={e=>setRestMinutes(Number(e.target.value))} className={inputCls}/></label>
            <label className="flex gap-2 text-xs leading-5 sm:col-span-2"><input type="checkbox" checked={allowEstimates} onChange={e=>setAllowEstimates(e.target.checked)}/>{p("estimates")}</label>
            <label className="flex gap-2 text-xs leading-5 sm:col-span-2"><input type="checkbox" checked={includeAttractions} onChange={e=>setIncludeAttractions(e.target.checked)}/>{p("include")}</label>
          </fieldset>

          <p className="mt-4 text-xs leading-5 text-[#796b5d]">{p("baseNotice")}</p>
          {/* primary action */}
          <button
            type="submit"
            disabled={planning || !compositionOk}
            className="mt-6 flex h-[58px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(90deg,#b66a13,#cd7c1c)] text-[15.5px] font-bold text-white shadow-[0_10px_26px_rgba(182,106,19,0.32)] transition hover:brightness-[1.06] active:translate-y-px disabled:opacity-70"
          >
            {planning ? (
              <>
                <span className="spinner !h-5 !w-5 !border-white/40 !border-t-white" aria-hidden="true" />
                {t("plan.planning")}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2l1.8 5.6L19.5 9l-4.4 3.4L16.2 18 12 14.9 7.8 18l1.1-5.6L4.5 9l5.7-1.4z" />
                </svg>
                {t("plan.planMyTrip")}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>

          {planError && <p role="alert" className="mt-4 rounded-xl border border-[#c76e48] bg-[#fff3e8] p-4 text-sm text-[#89391d]">{planError}</p>}

        </form>
      </div>
    </div>
  )
}
