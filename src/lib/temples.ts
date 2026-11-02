import fs from "node:fs"
import path from "node:path"

export type TempleSummary = {
  templeId: string
  name: string
  city: string
  district: string
  deity: string
  category: string
  rating: number | null
  reviewCount: number | null
  lat: number
  lon: number
  videoUrl: string | null
  /**
   * Direct, self-hosted footage when the team drops an owned/licensed file at
   * public/videos/{templeId}.mp4|webm|ogv (checked at data-load time). When
   * present the trip player uses a clean HTML5 <video> instead of YouTube.
   */
  videoFile: string | null
  image: string | null
  summary: string
  /** First published darshan window (real registry data, e.g. "8:00 AM – 1:00 PM"). */
  darshanHours: string | null
}

/** Read the full 23-temple registry at build time (server-only). */
export function loadTemples(): TempleSummary[] {
  try {
    const dir = path.join(process.cwd(), "multiagent", "data", "temples")
    const files = fs
      .readdirSync(dir)
      .filter((n) => /^T\d+\.json$/.test(n))
      .sort()
    const out: TempleSummary[] = []
    for (const file of files) {
      const r = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as Record<string, any>
      const loc = r.location || {}
      const reviews = r.reviews || {}
      const ratingRaw = typeof reviews.average_rating === "string" ? reviews.average_rating : ""
      const ratingMatch = ratingRaw.match(/(\d(?:\.\d)?)/)
      const reviewRaw =
        typeof reviews.total_reviews === "string" ? reviews.total_reviews : ""
      const reviewMatch = reviewRaw.match(/(\d[\d,]*)/)
      const images = Array.isArray(r.images) ? r.images : []
      const darshan = Array.isArray(r.darshan_timings) ? r.darshan_timings[0] : null
      const morning =
        darshan && typeof darshan.morning === "string" ? darshan.morning.trim() : ""
      const deity =
        (r.deity && r.deity.presiding_deity) ||
        (typeof r.deity === "string" ? r.deity : "") ||
        r.category ||
        "Hindu Temple"
      out.push({
        templeId: r.temple_id || file.replace(".json", ""),
        name: r.name || "Temple",
        city: loc.village || loc.town || "",
        district: (loc.district || "").replace(/\s*District$/i, ""),
        deity: String(deity).split("(")[0].split(",")[0].trim(),
        category: r.category || r.temple_type || "Hindu Temple",
        rating: ratingMatch ? Number(ratingMatch[1]) : null,
        reviewCount: reviewMatch ? Number(reviewMatch[1].replace(/,/g, "")) : null,
        lat: Number(loc.latitude) || 0,
        lon: Number(loc.longitude) || 0,
        videoUrl: r.video_url || null,
        videoFile: (() => {
          const id = r.temple_id || file.replace(".json", "")
          for (const ext of ["mp4", "webm", "ogv"]) {
            if (fs.existsSync(path.join(process.cwd(), "public", "videos", `${id}.${ext}`))) {
              return `/videos/${id}.${ext}`
            }
          }
          return null
        })(),
        image: typeof images[0] === "string" && images[0].startsWith("http") ? images[0] : null,
        summary: typeof r.summary === "string" ? r.summary : "",
        darshanHours: morning || null,
      })
    }
    return out
  } catch {
    return []
  }
}
