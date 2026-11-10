export function ItineraryValidation({ label, detail, tone = "neutral" }: { label?: string; detail?: string; tone?: "neutral" | "positive" | "warning" }) {
  if (!label && !detail) return null
  const toneClass = tone === "positive" ? "bg-emerald-50 text-emerald-800" : tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-[#f6efe3] text-[#79440f]"
  return <div className={`rounded-xl px-4 py-3 text-sm ${toneClass}`}>{label && <p className="font-medium">{label}</p>}{detail && <p className="mt-1 leading-5 opacity-80">{detail}</p>}</div>
}
