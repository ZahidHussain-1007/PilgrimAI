"use client"

import Link from "next/link"
import { useTrip } from "../../hooks/useTrip"
import { ApiError } from "../../services/api/client"
import { ItineraryCard } from "../itinerary/ItineraryCard"
import { ItineraryValidation } from "../itinerary/ItineraryValidation"
import { ItineraryDay } from "../itinerary/ItineraryDay"
import { ItineraryActivity } from "../itinerary/ItineraryActivity"
import { ItineraryTimeline } from "../itinerary/ItineraryTimeline"
import { ItineraryCost } from "../itinerary/ItineraryCost"

export function TripDetailsPage({ tripId }: { tripId: string }) {
  const trip = useTrip(tripId)

  if (trip.loading) return <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-[#827965]" role="status"><span className="size-4 animate-spin rounded-full border-2 border-[#e4dac8] border-t-[#aa6418]"/>Loading trip…</div>
  if (trip.error) {
    const notFound = trip.error instanceof ApiError && trip.error.status === 404
    return <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8"><Link className="text-sm text-[#79440f] hover:underline" href="/trips">← Back to My Trips</Link><div className="mt-8 rounded-2xl border border-[#eadfca] bg-[#fffefa] p-6" role="alert"><h1 className="font-serif text-2xl font-medium text-[#28271f]">{notFound ? "Trip not found" : "Trip details are unavailable"}</h1><p className="mt-2 text-sm text-[#827965]">{trip.error.message}</p><button className="mt-4 min-h-10 rounded-lg border border-[#d9c9ae] px-3 text-sm font-semibold text-[#79440f]" onClick={trip.retry}>Try again</button></div></section>
  }
  const data = trip.data
  if (!data) return <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8"><Link className="text-sm text-[#79440f] hover:underline" href="/trips">← Back to My Trips</Link><div className="mt-8 rounded-2xl border border-[#eadfca] bg-[#fffefa] p-6"><h1 className="font-serif text-2xl font-medium text-[#28271f]">Trip not found</h1><p className="mt-2 text-sm text-[#827965]">No trip details were returned for this address.</p></div></section>
  const destinations = data.destinations?.filter(Boolean).join(", ")
  const dates = [data.startDate, data.endDate].filter(Boolean).join(" — ")
  const details = [
    data.origin && { label: "From", value: data.origin },
    destinations && { label: "Destination", value: destinations },
    dates && { label: "Dates", value: dates },
    data.travellers != null && { label: "Travellers", value: String(data.travellers) },
    data.budget != null && { label: "Budget", value: data.budget.toLocaleString() },
    data.preferences?.length && { label: "Preferences", value: data.preferences.join(", ") },
    data.constraints?.length && { label: "Constraints", value: data.constraints.join(", ") },
    data.status && { label: "Status", value: data.status },
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  return <article className="mx-auto w-full max-w-5xl px-5 pb-12 sm:px-8 lg:px-12">
    <header className="border-b border-[#e8e0d1] py-7 sm:py-10"><Link className="text-sm text-[#79440f] hover:underline" href="/trips">← My Trips</Link><p className="mt-7 text-[10px] font-bold tracking-[.16em] text-[#9a8769]">TRIP WORKSPACE</p><h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#28271f] sm:text-4xl">{data.title || "Trip details"}</h1></header>
    <section className="py-7"><h2 className="font-serif text-xl font-medium text-[#28271f]">Trip details</h2>{details.length > 0 ? <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{details.map(({ label, value }) => <div className="rounded-xl border border-[#e9e2d6] bg-[#fffefa] p-4" key={label}><dt className="text-xs text-[#9a8769]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#28271f]">{value}</dd></div>)}</dl> : <p className="mt-3 text-sm text-[#827965]">Trip details have not been provided.</p>}</section>
    <section className="border-t border-[#e8e0d1] py-7"><div className="mb-5"><p className="text-[10px] font-bold tracking-[.16em] text-[#9a8769]">YOUR DAYS, AT YOUR PACE</p><h2 className="mt-2 font-serif text-2xl font-medium text-[#28271f]">Itinerary</h2></div><ItineraryCard title={data.itinerary?.title}>{data.itinerary?.days?.length ? <ItineraryTimeline>{data.itinerary.days.map((day, dayIndex) => <ItineraryDay key={day.id ?? dayIndex} label={day.label || `Day ${dayIndex + 1}`}>{day.activities?.length ? day.activities.map((activity, activityIndex) => <div key={activity.id ?? activityIndex}><ItineraryActivity title={activity.title} kind={activity.kind} time={[activity.startTime, activity.endTime].filter(Boolean).join(" – ")} description={activity.description}/><ItineraryCost amount={activity.estimatedCost} currency={activity.currency}/></div>) : <p className="text-sm text-[#827965]">No activities have been provided for this day.</p>}</ItineraryDay>)}</ItineraryTimeline> : <div className="py-4 text-center"><div className="mx-auto grid size-12 place-items-center rounded-full bg-[#f6f0e5] text-xl text-[#ae7a3d]" aria-hidden="true">☷</div><h3 className="mt-4 font-serif text-lg font-medium text-[#28271f]">No itinerary available yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#827965]">When an itinerary is available for this trip, its days and activities will appear here.</p></div>}{data.itinerary?.estimatedCost != null && <div className="mt-5"><ItineraryCost label="Estimated total" amount={data.itinerary.estimatedCost} currency={data.itinerary.currency}/></div>}</ItineraryCard>{data.itinerary?.validation && <div className="mt-4"><ItineraryValidation label={data.itinerary.validation.status} detail={data.itinerary.validation.detail}/></div>}</section>
  </article>
}
