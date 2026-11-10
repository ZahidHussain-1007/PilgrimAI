import fs from "node:fs"
import path from "node:path"
import { AppShell } from "../components/layout/AppShell"
import { LandingContent } from "../components/landing/LandingContent"
import type { Slide } from "../components/landing/TempleSlideshow"

/** v19.1: public landing INSIDE the app shell (sidebar + topbar like the
 *  reference design). Slideshow data = real temple dataset, read at build. */
function loadSlides(): Slide[] {
  try {
    const dir = path.join(process.cwd(), "multiagent", "data", "temples")
    const files = fs
      .readdirSync(dir)
      .filter((name) => /^T\d+\.json$/.test(name))
      .sort()
    const slides: Slide[] = []
    for (const file of files) {
      const record = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf-8"),
      ) as {
        temple_id?: string
        name?: string
        location?: { district?: string }
        images?: unknown[]
        video_url?: string
        summary?: unknown
      }
      const first = Array.isArray(record.images) ? record.images[0] : null
      if (typeof first !== "string" || !first.startsWith("http")) continue
      slides.push({
        templeId: record.temple_id || file,
        name: record.name || "Temple",
        district: record.location?.district,
        image: first,
        videoUrl: record.video_url,
        description:
          typeof record.summary === "string" && record.summary.length > 0
            ? record.summary.length > 165
              ? `${record.summary.slice(0, record.summary.lastIndexOf(" ", 165))}…`
              : record.summary
            : undefined,
      })
      if (slides.length >= 6) break
    }
    return slides
  } catch {
    return []
  }
}

export default function HomePage() {
  return (
    <AppShell>
      <LandingContent slides={loadSlides()} />
    </AppShell>
  )
}
