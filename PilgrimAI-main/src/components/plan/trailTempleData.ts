import type { TempleSummary } from "../../lib/temples"

/**
 * v19.8 — curated temple trail layout.
 *
 * The route is DECORATIVE (composition only). Real lat/lon stay in the
 * registry for directions/distance math. All 23 temples remain in the
 * data; the overview shows a stable curated subset (never slice(0, N)).
 */

/** Curated display labels — max 2 lines, unambiguous, never char-chopped.
 *  Full canonical name stays in details panel / aria-label / tooltip. */
export const DISPLAY_LABELS: Record<string, string[]> = {
  T0001: ["Yadadri", "Lakshmi Narasimha"],
  T0002: ["Sita Ramachandra"],
  T0003: ["Raja Rajeshwara"],
  T0004: ["Gnana Saraswathi"],
  T0005: ["Kondagattu", "Anjaneya"],
  T0006: ["Jogulamba"],
  T0007: ["Kaleshwara", "Mukteswara"],
  T0008: ["Chilkur Balaji"],
  T0009: ["Birla Mandir"],
  T0010: ["Sanghi"],
  T0011: ["Ramalingeswara"],
  T0012: ["Bhadrakali"],
  T0013: ["Rudreshwara"],
  T0014: ["Ramappa"],
  T0015: ["Komuravelli", "Mallikarjuna"],
  T0016: ["Edupayala", "Vana Durga"],
  T0017: ["Lakshmi Narasimha", "Dharmapuri"],
  T0018: ["Jamalapuram", "Venkateswara"],
  T0019: ["Manyamkonda", "L. Venkateswara"],
  T0020: ["Beechupally", "Abhaya Anjaneya"],
  T0021: ["Medaram", "Sammakka Saralamma"],
  T0022: ["Surendrapuri", "Kaladhamam"],
  T0023: ["Swarnagiri", "Venkateswara"],
}

/** Hand-placed decorative anchors (viewBox 1000×460). NOT geographic. */
export const ANCHORS: Record<string, { x: number; y: number }> = {
  // overview (9) — gentle rising band, ~110–135 units apart
  T0017: { x: 95, y: 352 },
  T0003: { x: 225, y: 318 },
  T0005: { x: 350, y: 288 },
  T0007: { x: 478, y: 262 },
  T0009: { x: 592, y: 232 },
  T0008: { x: 706, y: 246 },
  T0001: { x: 622, y: 338 }, // active reference (Yadadri)
  T0011: { x: 820, y: 212 },
  T0010: { x: 924, y: 184 },
  // intermediate (+6)
  T0002: { x: 152, y: 268 },
  T0004: { x: 287, y: 228 },
  T0006: { x: 412, y: 352 },
  T0012: { x: 530, y: 322 },
  T0014: { x: 760, y: 318 },
  T0013: { x: 868, y: 268 },
  // detail (+8) — all 23 reachable on the trail itself
  T0015: { x: 52, y: 290 },
  T0016: { x: 176, y: 196 },
  T0018: { x: 330, y: 392 },
  T0019: { x: 452, y: 188 },
  T0020: { x: 640, y: 404 },
  T0021: { x: 782, y: 390 },
  T0022: { x: 884, y: 344 },
  T0023: { x: 958, y: 268 },
}

/** Stable curated overview — chosen for geographic spread + recognisability.
 *  Never derive this with temples.slice(). */
export const OVERVIEW_IDS = [
  "T0017", "T0003", "T0005", "T0007", "T0009", "T0008", "T0001", "T0011", "T0010",
]

export const MID_IDS = [
  ...OVERVIEW_IDS, "T0002", "T0004", "T0006", "T0012", "T0014", "T0013",
]

/** Zoom levels: 0 overview (9) · 1 intermediate (15) · 2 detail (23). */
export function levelIds(level: number): string[] {
  if (level <= 0) return OVERVIEW_IDS
  if (level === 1) return MID_IDS
  return Object.keys(ANCHORS)
}

export type TrailNode = {
  temple: TempleSummary
  x: number
  y: number
  lines: string[]
  priority: number // 0 = active-capable curated order (lower = keep label first)
}

export function shortTempleName(name: string): string {
  return name
    .replace(/^Sri\s+/i, "")
    .replace(/\s+(Temple|Swamy Temple|Devi Temple|Devasthanam|Devalayam)$/i, "")
    .trim()
}

/** Registry temples → trail nodes for the given zoom level, in registry order. */
export function buildTrailNodes(temples: TempleSummary[], level: number): TrailNode[] {
  const ids = new Set(levelIds(level))
  const rank = (id: string) => {
    const i = OVERVIEW_IDS.indexOf(id)
    if (i >= 0) return i
    const j = MID_IDS.indexOf(id)
    if (j >= 0) return j
    return 99
  }
  return temples
    .filter((t) => ids.has(t.templeId) && ANCHORS[t.templeId])
    .map((temple) => {
      const { x, y } = ANCHORS[temple.templeId]
      return {
        temple,
        x,
        y,
        lines: DISPLAY_LABELS[temple.templeId] ?? [shortTempleName(temple.name)],
        priority: rank(temple.templeId),
      }
    })
}

/** Decorative route through the overview band (broad, gentle curves). */
export const ROUTE_D =
  "M -40 372 C 110 352 165 332 225 318 C 295 300 312 300 350 288 " +
  "C 418 270 442 272 478 262 C 528 248 562 240 592 232 " +
  "C 642 220 674 254 706 246 C 752 236 792 224 820 212 " +
  "C 862 196 892 192 924 184 C 962 175 1000 168 1040 158"

/** Small connector dots along the route. */
export const ROUTE_DOTS: [number, number][] = [
  [160, 336], [288, 304], [414, 276], [534, 252], [649, 234],
  [762, 230], [872, 198], [976, 172],
]
