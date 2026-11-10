"use client"

import { useMemo, useState } from "react"
import type { TempleSummary } from "../../lib/temples"
import { useT } from "../../lib/i18n"

/** Browse list — the map's keyboard-accessible equivalent. Real temple records only. */
export function TempleBrowser({
  temples,
  selectedIds,
  onAdd,
}: {
  temples: TempleSummary[]
  selectedIds: string[]
  onAdd: (id: string) => void
}) {
  const { t } = useT()
  const [q, setQ] = useState("")

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return temples
    return temples.filter((tm) =>
      [tm.name, tm.city, tm.district, tm.deity]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    )
  }, [temples, q])

  return (
    <div className="rounded-[22px] border border-[#e9d8c1] bg-[#fffdf9] p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-serif text-base font-semibold text-[#29251f]">{t("discover.browseTitle")}</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("discover.searchPh")}
          className="min-w-0 flex-1 rounded-full border border-[#e2d7c2] bg-white px-3.5 py-1.5 text-[12px] outline-none focus:border-[#c7a878]"
          aria-label={t("discover.searchPh")}
        />
      </div>
      <ul className="grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
        {rows.map((tm) => {
          const sel = selectedIds.includes(tm.templeId)
          return (
            <li key={tm.templeId} className="flex items-center gap-2 rounded-xl border border-[#f1e6d0] bg-[#fbf6ec] px-2 py-1.5">
              {tm.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tm.image} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f6efe3] text-xs">🛕</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#29251f]">{tm.name}</p>
                <p className="truncate text-[10.5px] text-[#796b5d]">{tm.city} · {tm.deity}</p>
              </div>
              <button
                type="button"
                onClick={() => onAdd(tm.templeId)}
                disabled={sel}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition ${
                  sel ? "cursor-default bg-[#f5e9d7] text-[#79440f]" : "bg-[#b66a13] text-white hover:bg-[#99580d]"
                }`}
              >
                {sel ? `✓ ${t("discover.added")}` : t("discover.addShort")}
              </button>
            </li>
          )
        })}
        {rows.length === 0 && (
          <li className="col-span-full py-4 text-center text-[12px] text-[#9a8f7b]">{t("discover.noResults")}</li>
        )}
      </ul>
    </div>
  )
}
