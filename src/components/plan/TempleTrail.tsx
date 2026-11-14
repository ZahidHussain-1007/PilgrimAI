"use client"

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { TempleSummary } from "../../lib/temples"
import {
  ROUTE_D,
  ROUTE_DOTS,
  buildTrailNodes,
  type TrailNode,
} from "./trailTempleData"
import { useT } from "../../lib/i18n"

const VB_W = 1000
const VB_H = 460
const MARKER_R = 24 // ≈43px diameter at the reference viewport
const ACTIVE_R = 36 // ≈65px
const LABEL_FONT = 14 // ≈12.6px on screen — never shrunk to fight crowding
const LINE_H = 17
const ZOOM_S = [1, 1.16, 1.32]

type PlacedLabel = { lines: string[]; x: number; y: number }

/** Greedy collision-aware label placement: active first, then curated
 *  priority. Try below the marker, then above; hide lower-priority labels
 *  that cannot fit (the active label is always shown). */
function placeLabels(
  nodes: TrailNode[],
  activeId: string | null,
  visible: TrailNode[],
): Map<string, PlacedLabel> {
  const placed = new Map<string, PlacedLabel>()
  const obstacles: { x: number; y: number; w: number; h: number }[] = visible.map(
    (n) => ({ x: n.x - MARKER_R - 6, y: n.y - MARKER_R - 6, w: (MARKER_R + 6) * 2, h: (MARKER_R + 6) * 2 }),
  )
  const fits = (b: { x: number; y: number; w: number; h: number }) =>
    !obstacles.some(
      (o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y,
    ) &&
    b.x > 6 &&
    b.x + b.w < VB_W - 6 &&
    b.y > 6 &&
    b.y + b.h < VB_H - 6

  const order = [...visible].sort((a, b) => {
    const aa = a.temple.templeId === activeId ? -1 : a.priority
    const bb = b.temple.templeId === activeId ? -1 : b.priority
    return aa - bb
  })

  for (const node of order) {
    const w = Math.max(...node.lines.map((l) => l.length)) * LABEL_FONT * 0.56 + 6
    const h = node.lines.length * LINE_H
    const active = node.temple.templeId === activeId
    const r = active ? ACTIVE_R : MARKER_R
    const below = { x: node.x - w / 2, y: node.y + r + 8, w, h }
    const above = { x: node.x - w / 2, y: node.y - r - 8 - h, w, h }
    if (fits(below)) {
      placed.set(node.temple.templeId, { lines: node.lines, x: node.x, y: below.y + h / 2 })
      obstacles.push(below)
    } else if (fits(above)) {
      placed.set(node.temple.templeId, { lines: node.lines, x: node.x, y: above.y + h / 2 })
      obstacles.push(above)
    } else if (active) {
      placed.set(node.temple.templeId, { lines: node.lines, x: node.x, y: below.y + h / 2 })
    }
  }
  return placed
}

/** Illustrative Telangana temple trail — spacious curated overview. */
export function TempleTrail({
  temples,
  selectedIds,
  activeId,
  onActivate,
  onAdd,
}: {
  temples: TempleSummary[]
  selectedIds: string[]
  activeId: string | null
  onActivate: (id: string) => void
  onAdd: (id: string) => void
}) {
  const { t } = useT()
  const [level, setLevel] = useState(0)
  const [listOpen, setListOpen] = useState(false)
  // popup opens only after an explicit click — the default active
  // highlight (Yadadri) never forces a detail card open
  const [popupFor, setPopupFor] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [popupPosition, setPopupPosition] = useState<{ left: number; top: number } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const S = ZOOM_S[level]
  const nodes = useMemo(() => buildTrailNodes(temples, level), [temples, level])
  const popupNode: TrailNode | null = nodes.find((n) => n.temple.templeId === popupFor) || null

  const tx = (x: number) => pan.x + 500 + (x - 500) * S
  const ty = (y: number) => pan.y + 230 + (y - 230) * S
  const placed = useMemo(() => placeLabels(nodes, activeId, nodes), [nodes, activeId])

  useLayoutEffect(() => {
    const frame = frameRef.current
    const popup = popupRef.current
    if (!popupNode || !frame || !popup) {
      setPopupPosition(null)
      return
    }

    const updatePosition = () => {
      const bounds = frame.getBoundingClientRect()
      const popupBounds = popup.getBoundingClientRect()
      if (!bounds.width || !bounds.height || !popupBounds.width || !popupBounds.height) return

      // The SVG uses xMidYMid meet, so account for any letterboxing when
      // translating its viewBox point to the popup's pixel position.
      const scale = Math.min(bounds.width / VB_W, bounds.height / VB_H)
      const offsetX = (bounds.width - VB_W * scale) / 2
      const offsetY = (bounds.height - VB_H * scale) / 2
      const anchorX = offsetX + tx(popupNode.x) * scale
      const anchorY = offsetY + ty(popupNode.y) * scale
      const margin = 8
      const maxLeft = Math.max(margin, bounds.width - popupBounds.width - margin)
      const left = Math.min(maxLeft, Math.max(margin, anchorX - popupBounds.width / 2))

      // Prefer above the selected marker, then below it; clamp either choice
      // so the whole detail card stays inside the map frame.
      let top = anchorY - popupBounds.height - 14
      if (top < margin) top = anchorY + 14
      const maxTop = Math.max(margin, bounds.height - popupBounds.height - margin)
      top = Math.min(maxTop, Math.max(margin, top))

      setPopupPosition((current) =>
        current && Math.abs(current.left - left) < 0.5 && Math.abs(current.top - top) < 0.5
          ? current
          : { left, top },
      )
    }

    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    observer.observe(frame)
    observer.observe(popup)
    return () => observer.disconnect()
  }, [popupNode, S, pan.x, pan.y])

  function onFramePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest("button, [data-trail-popup]")) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    }
  }

  function onFramePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return

    if (!drag.moved) {
      drag.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(true)
    }
    event.preventDefault()

    const bounds = frameRef.current?.getBoundingClientRect()
    const viewScale = bounds
      ? Math.min(bounds.width / VB_W, bounds.height / VB_H)
      : 1
    const limitX = 120 + (VB_W * (S - 1)) / 2
    const limitY = 70 + (VB_H * (S - 1)) / 2
    const nextX = drag.originX + deltaX / viewScale
    const nextY = drag.originY + deltaY / viewScale
    const draggingPastHorizontalEdge =
      (nextX <= -limitX && deltaX < 0) || (nextX >= limitX && deltaX > 0)
    if (draggingPastHorizontalEdge && level < ZOOM_S.length - 1) {
      // Edge-drag reveals the next detail level instead of making the user
      // stop and press the zoom button to discover more temples.
      setLevel(level + 1)
    }
    setPan({
      x: Math.max(-limitX, Math.min(limitX, nextX)),
      y: Math.max(-limitY, Math.min(limitY, nextY)),
    })
  }

  function finishFramePointer(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 400)
    }
    dragRef.current = null
    setDragging(false)
  }

  function onFrameClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  function onFrameClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target
    if (
      target instanceof Element &&
      target.closest("[data-trail-popup], [data-temple-marker], [data-temple-option]")
    ) {
      return
    }
    if (popupFor) {
      setPopupFor(null)
      onActivate("")
    }
  }

  function openTemple(id: string) {
    setLevel(2)
    setListOpen(false)
    onActivate(id)
    setPopupFor(id)
  }

  return (
    <div
      ref={frameRef}
      onPointerDown={onFramePointerDown}
      onPointerMove={onFramePointerMove}
      onPointerUp={finishFramePointer}
      onPointerCancel={finishFramePointer}
      onClickCapture={onFrameClickCapture}
      onClick={onFrameClick}
      className={`relative h-full w-full overflow-hidden rounded-[22px] border border-[#e9d8c1] bg-[#fbf6ec] touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-full w-full"
        role="group"
        aria-label={t("discover.trailLabel")}
      >
        {/* soft decor — low contrast, scaled with zoom */}
        <g transform={`translate(${pan.x + 500 - 500 * S} ${pan.y + 230 - 230 * S}) scale(${S})`}>
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="#fbf6ec" />
          <circle cx="560" cy="118" r="46" fill="#efd9ae" opacity="0.55" />
          <circle cx="560" cy="118" r="66" fill="#efd9ae" opacity="0.18" />
          {/* distant hills */}
          <path d="M0 250c120-52 260-58 420-18 150 38 280 30 410-12 90-30 130-28 170-20v120H0z" fill="#f1e7d1" opacity="0.65" />
          <path d="M0 292c160-40 300-38 460-6 140 28 280 22 400-14 80-24 120-24 140-18v96H0z" fill="#eee2c6" opacity="0.5" />
          {/* birds */}
          <path d="M210 128c5-4 9-4 13 0M232 116c5-4 9-4 13 0M788 108c5-4 9-4 13 0M812 120c4.4-3.5 8-3.5 11.5 0" stroke="#cfb78e" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.7" />
          {/* trees */}
          {[[120, 400], [520, 415], [880, 380]].map(([tx0, ty0], i) => (
            <g key={`t${i}`} transform={`translate(${tx0} ${ty0})`} opacity="0.85">
              <rect x="-2.5" y="-15" width="5" height="16" rx="2" fill="#b08a5c" />
              <circle cx="0" cy="-26" r="14" fill="#d7e3c2" stroke="#b3c295" strokeWidth="1.4" />
              <circle cx="-9" cy="-18" r="8.5" fill="#dfe8ce" stroke="#b3c295" strokeWidth="1.1" />
              <circle cx="9" cy="-18" r="8.5" fill="#dfe8ce" stroke="#b3c295" strokeWidth="1.1" />
            </g>
          ))}
          {/* thin flowing gold route */}
          <path d={ROUTE_D} stroke="#e4c583" strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.9" />
          <path d={ROUTE_D} stroke="#d9a54e" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeDasharray="1 9" opacity="0.9" />
          {ROUTE_DOTS.map(([dx, dy], i) => (
            <circle key={`d${i}`} cx={dx} cy={dy} r="3.2" fill="#d9a54e" opacity="0.85" />
          ))}
        </g>

        {/* markers — constant size regardless of zoom (positions follow the route) */}
        {nodes.map((node) => {
          const cx = tx(node.x)
          const cy = ty(node.y)
          const isSel = selectedIds.includes(node.temple.templeId)
          const isActive = node.temple.templeId === activeId
          const r = isActive ? ACTIVE_R : MARKER_R
          return (
            <g key={node.temple.templeId}>
              {isActive && <circle cx={cx} cy={cy} r={r + 12} fill="#e2b260" opacity="0.22" />}
              <g
                data-temple-marker
                className="cursor-pointer"
                onClick={() => {
                  onActivate(node.temple.templeId)
                  setPopupFor(node.temple.templeId)
                }}
                role="button"
                tabIndex={0}
                aria-label={node.temple.name}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onActivate(node.temple.templeId)
                    setPopupFor(node.temple.templeId)
                  }
                }}
              >
                <circle cx={cx} cy={cy} r={r} fill="#fffdf9" stroke={isActive ? "#d9a54e" : "#e2c084"} strokeWidth={isActive ? 3 : 1.6} />
                {/* orange temple line icon */}
                <g transform={`translate(${cx} ${cy}) scale(${isActive ? 1.35 : 1})`} stroke="#d97b25" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M-8 7h16" />
                  <path d="M-6.5 7V-1h13V7" />
                  <path d="M-4.5 -1L0 -8.5 4.5 -1" />
                  <path d="M0 -8.5V-12" />
                  <path d="M0 -12l6 2.2L0 -7.6z" fill="#d97b25" stroke="none" />
                  <path d="M-2 7V2.5h4V7" />
                </g>
                {isSel && (
                  <circle cx={cx + r * 0.72} cy={cy - r * 0.72} r={isActive ? 9 : 7.5} fill="#b66a13" stroke="#fffdf9" strokeWidth="1.8" />
                )}
                {isSel && (
                  <path d={`M${cx + r * 0.72 - 3.4} ${cy - r * 0.72}l2.4 2.6 4.4-5`} stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </g>
              {/* dark-orange nameplate for the active temple */}
              {isActive && (
                <ActiveNameplate node={node} cx={cx} cy={cy} r={r} />
              )}
            </g>
          )
        })}

        {/* collision-aware labels (active label is part of its nameplate) */}
        {[...placed.entries()].map(([id, label]) => {
          if (id === activeId) return null
          const node = nodes.find((n) => n.temple.templeId === id)
          if (!node) return null
          return (
            <text
              key={id}
              x={tx(node.x)}
              y={ty(label.y)}
              textAnchor="middle"
              fontSize={LABEL_FONT}
              fontWeight={600}
              fill="#5c5040"
              stroke="#fbf6ec"
              strokeWidth="3.5"
              paintOrder="stroke"
              strokeLinejoin="round"
              className="marker-label"
            >
              {label.lines.map((line, i) => (
                <tspan key={i} x={tx(node.x)} dy={i === 0 ? 0 : LINE_H}>
                  {line}
                </tspan>
              ))}
            </text>
          )
        })}
      </svg>

      {/* top-left trail pill + dropdown to the full list */}
      <div className="absolute left-4 top-4 z-20">
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          aria-expanded={listOpen}
          className="flex items-center gap-2 rounded-full border border-[#e5c890] bg-[#fffdf9] px-4 py-2 shadow-[0_4px_14px_rgba(41,37,31,0.08)] transition hover:bg-[#faf4e8]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b66a13" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21z" />
            <circle cx="12" cy="10.4" r="2.4" />
          </svg>
          <span className="font-serif text-[13px] font-semibold text-[#8a5a1a]">{t("discover.trailBanner")}</span>
          <span className="text-[12px] text-[#9a8156]">({temples.length} {t("discover.signTemples")})</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9a8156" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${listOpen ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {listOpen && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 rounded-2xl border border-[#e5c890] bg-[#fffdf9] py-1.5 shadow-[0_10px_28px_rgba(41,37,31,0.14)]">
            <p className="px-3.5 pb-1 pt-1 text-[10px] uppercase tracking-[0.18em] text-[#9a8f7b]">{t("discover.listAll")}</p>
            <ul className="max-h-60 overflow-y-auto">
              {temples.map((tm) => (
                <li key={tm.templeId}>
                  <button
                    type="button"
                    data-temple-option
                    onClick={() => openTemple(tm.templeId)}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-1.5 text-left text-[12px] text-[#4a4436] transition hover:bg-[#f6efe3]"
                  >
                    <span className="truncate">{tm.name}</span>
                    {selectedIds.includes(tm.templeId) && <span className="shrink-0 text-[10px] font-semibold text-[#b66a13]">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* subset note — the overview shows a curated slice of the catalog */}
      <p className="absolute bottom-3 left-4 z-10 rounded-full bg-[#fbf6ec]/85 px-2.5 py-1 text-[10.5px] text-[#9a8f7b]">
        {t("discover.overviewNote")
          .replace("{shown}", String(nodes.length))
          .replace("{total}", String(temples.length))}
      </p>

      {/* zoom controls (detail levels reveal more of the trail) */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col overflow-hidden rounded-xl border border-[#e0cfa8] bg-[#fffdf9] shadow-sm">
        <button
          type="button"
          aria-label={t("discover.zoomIn")}
          disabled={level >= ZOOM_S.length - 1}
          className="px-3 py-1.5 text-lg font-semibold text-[#8a5a1a] transition hover:bg-[#f6efe3] disabled:opacity-30"
          onClick={() => setLevel((l) => Math.min(ZOOM_S.length - 1, l + 1))}
        >
          +
        </button>
        <span className="h-px bg-[#e9d8c1]" />
        <button
          type="button"
          aria-label={t("discover.zoomOut")}
          disabled={level <= 0}
          className="px-3 py-1.5 text-lg font-semibold text-[#8a5a1a] transition hover:bg-[#f6efe3] disabled:opacity-30"
          onClick={() => setLevel((l) => Math.max(0, l - 1))}
        >
          −
        </button>
      </div>

      {/* detail popup (explicit add — selection never auto-adds to a trip) */}
      {popupNode && (
        <TrailPopup
          node={popupNode}
          popupRef={popupRef}
          position={popupPosition}
          selected={selectedIds.includes(popupNode.temple.templeId)}
          onAdd={() => onAdd(popupNode.temple.templeId)}
          onClose={() => {
            setPopupFor(null)
            onActivate("")
          }}
        />
      )}
    </div>
  )
}

function ActiveNameplate({ node, cx, cy, r }: { node: TrailNode; cx: number; cy: number; r: number }) {
  const w = Math.max(...node.lines.map((l) => l.length)) * LABEL_FONT * 0.6 + 30
  const h = node.lines.length * 18 + 12
  const x = cx - w / 2
  const y = cy + r + 12
  return (
    <g className="trail-nameplate">
      <rect x={x} y={y} width={w} height={h} rx="10" fill="#a85411" />
      <text x={cx} y={y + (h - (node.lines.length - 1) * 18) / 2 + 5} textAnchor="middle" fontSize={LABEL_FONT} fontWeight={700} fill="#ffffff">
        {node.lines.map((line, i) => (
          <tspan key={i} x={cx} dy={i === 0 ? 0 : 18}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function TrailPopup({
  node,
  popupRef,
  position,
  selected,
  onAdd,
  onClose,
}: {
  node: TrailNode
  popupRef: { current: HTMLDivElement | null }
  position: { left: number; top: number } | null
  selected: boolean
  onAdd: () => void
  onClose: () => void
}) {
  const { t } = useT()
  return (
    <div
      ref={popupRef}
      data-trail-popup
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className="absolute z-30 w-[236px] rounded-2xl border-2 border-[#e2b26a] bg-[#fffdf9] p-3 shadow-[0_10px_28px_rgba(41,37,31,0.18)]"
      style={{
        left: position?.left ?? 8,
        top: position?.top ?? 8,
        maxWidth: "calc(100% - 16px)",
        maxHeight: "calc(100% - 16px)",
        overflowY: "auto",
        visibility: position ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("discover.close")}
        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-[#fffdf9]/90 text-[18px] font-medium leading-none text-[#796b5d] shadow-sm transition hover:bg-[#f5e9d7] hover:text-[#29251f]"
      >
        ×
      </button>
      {node.temple.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={node.temple.image} alt="" className="h-20 w-full rounded-xl object-cover" />
      ) : (
        <div className="grid h-20 w-full place-items-center rounded-xl bg-[#f6efe3] text-xs text-[#9a8f7b]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c99a58" strokeWidth="1.6"><path d="M4 20V10l8-7 8 7v10"/><path d="M9 20v-6h6v6"/></svg>
        </div>
      )}
      <p className="mt-2 text-[13px] font-bold leading-tight text-[#29251f]">{node.temple.name}</p>
      <p className="mt-0.5 text-[11px] text-[#796b5d]">{node.temple.city || node.temple.district}</p>
      <button
        type="button"
        onClick={onAdd}
        disabled={selected}
        className={`mt-2.5 w-full rounded-full py-2 text-xs font-semibold transition ${
          selected
            ? "cursor-default border border-[#e9d8c1] bg-[#f5e9d7] text-[#79440f]"
            : "bg-[#b66a13] text-white hover:bg-[#99580d]"
        }`}
      >
        {selected ? `✓ ${t("discover.added")}` : t("discover.addTrip")}
      </button>
    </div>
  )
}
