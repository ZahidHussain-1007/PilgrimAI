import Link from "next/link"
import type { TripCreatedViewModel } from "../../types/message"

export function TripCreatedCard({ trip }: { trip: TripCreatedViewModel }) {
  const destinations = trip.destinations?.filter(Boolean).join(" · ")
  return (
    <section
      className="my-4 max-w-md rounded-2xl border border-[#e8dcc5] bg-[#fffefa] p-5 shadow-sm"
      aria-label="Trip created"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f5ecdd] text-lg text-[#9b622e]" aria-hidden="true">✦</span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#9a8769]">Trip planned</p>
          {trip.title && <h3 className="mt-1 font-serif text-lg font-medium text-[#28271f]">{trip.title}</h3>}
          {destinations && <p className="mt-1 text-sm text-[#756d5e]">{destinations}</p>}
          {trip.dateSummary && <p className="mt-1 text-sm text-[#756d5e]">{trip.dateSummary}</p>}
          {trip.description && <p className="mt-2 text-sm leading-6 text-[#827965]">{trip.description}</p>}
          {trip.id && (
            <Link className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#aa6418] px-4 text-sm font-semibold text-white hover:bg-[#79440f]" href={`/trips/${encodeURIComponent(trip.id)}`}>
              View Trip <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
