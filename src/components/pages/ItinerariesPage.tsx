"use client"

import Link from "next/link"
import { useItineraries } from "../../hooks/useItineraries"

export function ItinerariesPage() {
  const itineraries = useItineraries()
  const hasUnmappedResponse = itineraries.data !== null && itineraries.data !== undefined
  return <section className="mx-auto w-full max-w-5xl px-5 pb-12 sm:px-8 lg:px-12">
    <header className="border-b border-[#e8e0d1] py-8 sm:py-11"><p className="text-[10px] font-bold tracking-[.16em] text-[#9a8769]">THE DAYS AHEAD</p><h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#28271f] sm:text-4xl">Itineraries</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#827965]">Detailed day plans live with their trip, so each journey stays together.</p></header>
    {itineraries.loading && <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-[#827965]" role="status"><span className="size-4 animate-spin rounded-full border-2 border-[#e4dac8] border-t-[#aa6418]"/>Loading itineraries…</div>}
    {itineraries.error && <div className="mt-7 rounded-2xl border border-[#eadfca] bg-[#fffefa] p-6" role="alert"><h2 className="font-serif text-xl text-[#28271f]">Itineraries are unavailable</h2><p className="mt-2 text-sm text-[#827965]">{itineraries.error.message}</p><button className="mt-4 min-h-10 rounded-lg border border-[#d9c9ae] px-3 text-sm font-semibold text-[#79440f]" onClick={itineraries.retry}>Try again</button></div>}
    {!itineraries.loading && !itineraries.error && !hasUnmappedResponse && <div className="mx-auto flex min-h-[340px] max-w-lg flex-col items-center justify-center py-12 text-center"><div className="grid size-14 place-items-center rounded-full bg-[#f6f0e5] text-2xl text-[#ae7a3d]" aria-hidden="true">☷</div><h2 className="mt-5 font-serif text-2xl text-[#28271f]">No itineraries yet</h2><p className="mt-2 text-sm leading-6 text-[#827965]">Create or plan a trip first. Its detailed itinerary will be available in the trip workspace.</p><Link href="/trips" className="mt-5 min-h-11 rounded-xl bg-[#aa6418] px-4 py-3 text-sm font-semibold text-white">View My Trips <span aria-hidden="true">→</span></Link></div>}
    {!itineraries.loading && !itineraries.error && hasUnmappedResponse && <div className="mt-7 rounded-2xl border border-[#e9e2d6] bg-[#fffefa] p-6 text-sm text-[#827965]">Full itinerary details are available within each trip workspace.</div>}
  </section>
}
