"use client"

import { useState } from "react"
import Link from "next/link"
import { useTrips } from "../../hooks/useTrips"
import { TripCard } from "../trips/TripCard"
import { CreateTripDialog } from "../trips/CreateTripDialog"

export function TripsPage() {
  const trips = useTrips()
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[#e8e0d1] py-8 sm:py-11">
        <div>
          <p className="text-[10px] font-bold tracking-[.16em] text-[#9a8769]">YOUR JOURNEYS</p>
          <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#28271f] sm:text-4xl">My Trips</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#827965]">Your trip workspace, from the first idea through every day of the journey.</p>
        </div>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#aa6418] px-4 text-sm font-semibold text-white transition hover:bg-[#79440f]" onClick={() => setCreateOpen(true)}>
          <span aria-hidden="true">＋</span> Create Trip
        </button>
      </header>
      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-medium text-[#28271f]">Your Trips</h2>
        {trips.data && <span className="text-xs text-[#827965]">{trips.data.length} {trips.data.length === 1 ? "trip" : "trips"}</span>}
      </div>
      {trips.loading && <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-[#827965]" role="status"><span className="size-4 animate-spin rounded-full border-2 border-[#e4dac8] border-t-[#aa6418]"/>Loading trips…</div>}
      {trips.error && <div className="mt-6 rounded-2xl border border-[#eadfca] bg-[#fffefa] p-6" role="alert"><h3 className="font-medium text-[#28271f]">{trips.error.message.includes("not configured") ? "Trips are not connected yet" : "We couldn’t load your trips"}</h3><p className="mt-1 text-sm text-[#827965]">{trips.error.message}</p><button className="mt-4 min-h-10 rounded-lg border border-[#d9c9ae] px-3 text-sm font-semibold text-[#79440f]" onClick={trips.retry}>Try again</button></div>}
      {!trips.loading && !trips.error && trips.data?.length === 0 && <div className="mx-auto flex min-h-[360px] max-w-lg flex-col items-center justify-center py-12 text-center"><div className="grid size-16 place-items-center rounded-full border border-[#e9dfcb] bg-[#f6f0e5] text-2xl text-[#ae7a3d]" aria-hidden="true">↗</div><h3 className="mt-5 font-serif text-2xl font-medium text-[#28271f]">No trips yet</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#827965]">Start planning a trip with PilgrimAI. Your saved journeys and itineraries will appear here.</p><Link href="/chat" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#aa6418] px-4 text-sm font-semibold text-white hover:bg-[#79440f]">Start Planning <span className="ml-2" aria-hidden="true">→</span></Link><button className="mt-2 min-h-10 rounded-lg px-3 text-sm font-medium text-[#79440f] hover:bg-[#f6efe3]" onClick={() => setCreateOpen(true)}>Create Trip</button></div>}
      {!trips.loading && !trips.error && Boolean(trips.data?.length) && <div className="mt-5 grid gap-4 md:grid-cols-2">{trips.data?.map((trip) => <TripCard key={trip.id} trip={trip}/>)}</div>}
      {createOpen && <CreateTripDialog onClose={() => setCreateOpen(false)}/>}
    </section>
  )
}
