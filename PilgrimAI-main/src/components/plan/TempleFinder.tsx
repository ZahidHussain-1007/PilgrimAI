"use client"

import { useState } from "react"
import type { TempleSummary } from "../../lib/temples"
import { useT } from "../../lib/i18n"

type Answers = { vibe: string | null; deity: string | null; time: string | null }

/** P2 temple finder — 3-question matcher that ranks the registry. */
export default function TempleFinder({
  temples,
  onPick,
  onBack,
}: {
  temples: TempleSummary[]
  onPick: (id: string) => void
  onBack: () => void
}) {
  const { t } = useT()
  const [step, setStep] = useState(0)
  const [a, setA] = useState<Answers>({ vibe: null, deity: null, time: null })
  const [result, setResult] = useState<TempleSummary | null>(null)

  const questions = [
    {
      key: "vibe" as const,
      q: "What draws you on this yatra?",
      opts: [
        { v: "peace", label: "🕊️ Peace & blessings" },
        { v: "power", label: "🔥 Powerful deity" },
        { v: "heritage", label: "🏛️ History & architecture" },
        { v: "nature", label: "🌿 Scenic & hilltop" },
      ],
    },
    {
      key: "deity" as const,
      q: "Which deity do you feel drawn to?",
      opts: [
        { v: "vishnu", label: "Vishnu / Rama" },
        { v: "shiva", label: "Shiva" },
        { v: "shakti", label: "Devi / Shakti" },
        { v: "any", label: "No preference" },
      ],
    },
    {
      key: "time" as const,
      q: "How far are you willing to travel from Hyderabad?",
      opts: [
        { v: "near", label: "Under 3 hrs" },
        { v: "mid", label: "3–5 hrs" },
        { v: "far", label: "I'll go anywhere" },
      ],
    },
  ]

  const HYD: [number, number] = [17.385, 78.4867]
  const distKm = (t: TempleSummary) => {
    const R = 6371
    const dLat = ((t.lat - HYD[0]) * Math.PI) / 180
    const dLon = ((t.lon - HYD[1]) * Math.PI) / 180
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((HYD[0] * Math.PI) / 180) *
        Math.cos((t.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  }

  const score = (t: TempleSummary) => {
    let s = 0
    const cat = (t.category + " " + t.deity).toLowerCase()
    if (a.vibe === "peace") s += /vishnav|rama|saraswati|balaji/.test(cat) ? 3 : 1
    if (a.vibe === "power") s += /shakti|hanuman|jogulamba|devi/.test(cat) ? 3 : 1
    if (a.vibe === "heritage") s += /unesco|heritage|kakatiya|fort|ancient/.test(cat) ? 3 : 1
    if (a.vibe === "nature") s += /hill|konda|gutta|scenic/.test(t.name.toLowerCase() + cat) ? 3 : 1
    if (a.deity === "vishnu" && /vishnav|rama|narasimha|balaji|venkates/.test(cat)) s += 4
    if (a.deity === "shiva" && /shaiv|shiva|rajeshwara|mukteswara/.test(cat)) s += 4
    if (a.deity === "shakti" && /shakti|devi|durga|bhadrakali|saraswati/.test(cat)) s += 4
    const km = distKm(t)
    if (a.time === "near") s += km < 150 ? 4 : km < 220 ? 2 : 0
    if (a.time === "mid") s += km >= 120 && km < 300 ? 4 : km < 340 ? 1 : 0
    if (a.time === "far") s += 2
    if (t.rating != null) s += t.rating * 0.4
    return s
  }

  const answered = a.vibe && a.deity && a.time
  const ranked = answered
    ? [...temples].filter((t) => t.lat && t.lon).sort((x, y) => score(y) - score(x))
    : []

  if (result) {
    return (
      <div className="rounded-[20px] border border-[#e9d8c1] bg-[#fffdf9] p-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#79440f]">{t("finder.match")}</p>
        <h2 className="mt-2 font-serif text-3xl font-semibold">{result.name}</h2>
        <p className="mt-1 text-sm text-[#796b5d]">
          {result.city} · {result.district}
        </p>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#5c5544]">
          {result.summary || result.deity}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => onPick(result.templeId)}
            className="inline-flex h-[50px] items-center rounded-full bg-[#b66a13] px-7 text-sm font-medium text-white hover:bg-[#99580d]"
          >
            {t("finder.plan")} →
          </button>
          <button
            onClick={() => { setResult(null); setStep(0); setA({ vibe: null, deity: null, time: null }) }}
            className="inline-flex h-[50px] items-center rounded-full border border-[#e9d8c1] bg-white px-7 text-sm font-medium text-[#79440f] hover:bg-[#f5e9d7]"
          >
            {t("finder.again")}
          </button>
        </div>
        {ranked.length > 1 && (
          <div className="mt-8 border-t border-[#f0e8d8] pt-5">
            <p className="text-xs text-[#9a8f7b]">{t("finder.others")}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {ranked.slice(1, 5).map((r) => (
                <button
                  key={r.templeId}
                  onClick={() => setResult(r)}
                  className="rounded-full border border-[#e9d8c1] bg-white px-3.5 py-1.5 text-xs text-[#79440f] hover:bg-[#f5e9d7]"
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const current = questions[step]
  return (
    <div className="rounded-[20px] border border-[#e9d8c1] bg-[#fffdf9] p-8">
      <button onClick={onBack} className="mb-4 text-xs text-[#79440f] hover:underline">
        ← {t("plan.back")}
      </button>
      <div className="flex items-center gap-2">
        {questions.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i <= step ? "w-8 bg-[#b66a13]" : "w-4 bg-[#e9d8c1]"}`}
          />
        ))}
      </div>
      <h2 className="mt-5 font-serif text-2xl font-semibold">{current.q}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {current.opts.map((o) => (
          <button
            key={o.v}
            onClick={() => {
              setA((prev) => ({ ...prev, [current.key]: o.v }))
              if (step < questions.length - 1) setStep(step + 1)
            }}
            className="rounded-2xl border border-[#e9d8c1] bg-white px-5 py-4 text-left text-sm font-medium text-[#29251f] transition hover:border-[#b66a13] hover:bg-[#faf6ee]"
          >
            {o.label}
          </button>
        ))}
      </div>
      {answered && step === questions.length - 1 && (
        <button
          onClick={() => setResult(ranked[0])}
          className="mt-6 inline-flex h-[50px] items-center rounded-full bg-[#b66a13] px-7 text-sm font-medium text-white hover:bg-[#99580d]"
        >
          {t("finder.reveal")} →
        </button>
      )}
    </div>
  )
}
