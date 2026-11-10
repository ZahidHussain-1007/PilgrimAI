"use client"
import { useEffect, useRef, useState } from "react"

export type Slide = {
  templeId: string
  name: string
  district?: string
  image: string
  description?: string
  videoUrl?: string
}

/** Target hero: full-bleed cover image, dark gradient from the LEFT,
 *  district + serif name + saffron divider + description on the left,
 *  glass arrows on the sides, dots bottom-center. */
export function TempleSlideshow({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const reducedMotion = useRef(false)

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  useEffect(() => {
    if (paused || slides.length <= 1 || reducedMotion.current) return
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [paused, slides.length])

  if (slides.length === 0) return null
  const current = slides[Math.min(index, slides.length - 1)]

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[22px] border border-[#e9d8c1] bg-[#29251f] shadow-[0_16px_40px_rgba(41,37,31,0.14)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-label="Featured temples"
    >
      {broken[current.templeId] || !current.image ? (
        <div className="absolute inset-0 bg-gradient-to-br from-[#b66a13] via-[#d69a42] to-[#79440f]" />
      ) : (
        <img
          src={current.image}
          alt={current.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
          onError={() =>
            setBroken((b) => ({ ...b, [current.templeId]: true }))
          }
        />
      )}

      {/* reference gradient: 85% → 60% → 12% → 5% left→right */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(20,17,11,0.85) 0%, rgba(20,17,11,0.60) 35%, rgba(20,17,11,0.12) 75%, rgba(20,17,11,0.05) 100%)",
        }}
      />

      <div className="absolute inset-y-0 left-0 flex max-w-[86%] flex-col justify-center pl-14 pr-4 sm:max-w-[62%] sm:pl-20 sm:pr-6">
        <p className="flex items-center gap-1.5 text-[13px] uppercase tracking-[0.16em] text-[#f0dcb6]">
          <span aria-hidden="true">📍</span>
          {current.district || "Telangana"}
        </p>
        <h2 className="hero-title mt-2 max-w-[540px] font-serif text-[clamp(1.5rem,2.6vw,2.2rem)] font-semibold leading-[1.15] text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.45)]">
          {current.name}
        </h2>
        <span className="mt-3 h-[3px] w-12 rounded-full bg-[#d69a42]" aria-hidden="true" />
        {current.description ? (
          <p className="hero-desc mt-3 text-[15px] leading-6 text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
            {current.description}
          </p>
        ) : null}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous temple"
            className="absolute left-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/35 bg-black/25 text-xl text-white backdrop-blur transition hover:bg-black/45"
            onClick={() =>
              setIndex((i) => (i - 1 + slides.length) % slides.length)
            }
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next temple"
            className="absolute right-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/35 bg-black/25 text-xl text-white backdrop-blur transition hover:bg-black/45"
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.templeId}
                type="button"
                aria-label={`Show ${slide.name}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-[#d69a42]" : "w-2 bg-white/60"
                }`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
