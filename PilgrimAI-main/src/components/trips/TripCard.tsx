import Link from "next/link"
import type { Trip } from "../../types/trip"

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date)
}

export function TripCard({ trip }: { trip: Trip }) {
  const route = [
    trip.origin,
    trip.destinations?.length ? trip.destinations.join(", ") : undefined,
  ]
    .filter(Boolean)
    .join("  →  ")
  const dates = [trip.startDate, trip.endDate]
    .filter((date): date is string => Boolean(date))
    .map(dateLabel)
    .join(" — ")

  return (
    <article className="rounded-2xl border border-[#e9e2d6] bg-[#fffefa] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {trip.title && <h2 className="font-serif text-xl font-medium text-[#28271f]">{trip.title}</h2>}
          {route && <p className="mt-2 text-sm text-[#827965]">{route}</p>}
        </div>
        {trip.status && (
          <span className="rounded-full bg-[#f6efe3] px-3 py-1 text-xs font-medium capitalize text-[#79440f]">
            {trip.status}
          </span>
        )}
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#756d5e]">
        {dates && (
          <div>
            <dt className="sr-only">Dates</dt>
            <dd><span aria-hidden="true">◷ </span>{dates}</dd>
          </div>
        )}
        {trip.travellers != null && (
          <div>
            <dt className="sr-only">Travellers</dt>
            <dd><span aria-hidden="true">♙ </span>{trip.travellers} {trip.travellers === 1 ? "traveller" : "travellers"}</dd>
          </div>
        )}
        {trip.budget != null && (
          <div>
            <dt className="sr-only">Budget</dt>
            <dd>Budget · {trip.budget.toLocaleString()}</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 flex justify-end border-t border-[#eee8dc] pt-4">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#aa6418] px-4 text-sm font-semibold text-white transition hover:bg-[#79440f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#aa6418]"
          href={`/trips/${encodeURIComponent(trip.id)}`}
        >
          View Trip <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}
