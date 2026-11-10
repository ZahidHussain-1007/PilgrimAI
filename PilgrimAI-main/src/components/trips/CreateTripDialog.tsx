"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { tripsApi } from "../../services/api/trips.api"

export function CreateTripDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)

    const form = event.currentTarget
    const formData = new FormData(form)

    const title = (formData.get("title") as string)?.trim()
    if (!title) {
      setErrorMessage("Please provide a trip title.")
      setSubmitting(false)
      return
    }

    const origin = (formData.get("origin") as string)?.trim() || undefined
    const rawDestinations = (formData.get("destinations") as string)?.trim()
    const destinations = rawDestinations
      ? rawDestinations.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined
    const startDate = (formData.get("startDate") as string)?.trim() || undefined
    const endDate = (formData.get("endDate") as string)?.trim() || undefined
    const rawTravellers = formData.get("travellers") as string
    const travellers = rawTravellers ? parseInt(rawTravellers, 10) : undefined
    const rawBudget = formData.get("budget") as string
    const budget = rawBudget ? parseFloat(rawBudget) : undefined
    const rawPreferences = (formData.get("preferences") as string)?.trim()
    const preferences = rawPreferences
      ? rawPreferences.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined

    try {
      const createdTrip = await tripsApi.create({
        title,
        origin,
        destinations,
        startDate,
        endDate,
        travellers,
        budget,
        preferences,
        status: "planning",
      })

      onClose()
      if (createdTrip?.id) {
        router.push(`/trips/${encodeURIComponent(createdTrip.id)}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Unable to create trip. Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#17140f69] sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[#fffefa] p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-trip-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold tracking-[.15em] text-[#9a8769]">
              A NEW JOURNEY
            </p>
            <h2
              id="create-trip-title"
              className="mt-2 font-serif text-2xl font-medium text-[#28271f]"
            >
              Create a Trip
            </h2>
            <p className="mt-1 text-sm text-[#827965]">
              Add a few details to start shaping your plans.
            </p>
          </div>
          <button
            className="grid size-10 shrink-0 place-items-center rounded-full text-xl text-[#827965] hover:bg-[#f2eadc]"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f] sm:col-span-2">
            Trip title
            <input
              className="min-h-11 rounded-xl border border-[#e2dacb] bg-white px-3 font-normal outline-none focus:border-[#aa6418] focus:ring-2 focus:ring-[#aa6418]/15"
              name="title"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f]">
            From
            <input
              className="min-h-11 rounded-xl border border-[#e2dacb] bg-white px-3 font-normal outline-none focus:border-[#aa6418]"
              name="origin"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f]">
            Destination(s)
            <input
              className="min-h-11 rounded-xl border border-[#e2dacb] bg-white px-3 font-normal outline-none focus:border-[#aa6418]"
              name="destinations"
              placeholder="e.g. Yadadri, Warangal"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f]">
            Start date
            <input
              className="min-h-11 rounded-xl border border-[#e2dacb] bg-white px-3 font-normal outline-none focus:border-[#aa6418]"
              type="date"
              name="startDate"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f]">
            End date
            <input
              className="min-h-11 rounded-xl border border-[#e2dacb] bg-white px-3 font-normal outline-none focus:border-[#aa6418]"
              type="date"
              name="endDate"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f]">
            Travellers
            <input
              className="min-h-11 rounded-xl border border-[#e2dacb] bg-white px-3 font-normal outline-none focus:border-[#aa6418]"
              type="number"
              min="1"
              name="travellers"
              defaultValue="1"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f]">
            Budget (₹)
            <input
              className="min-h-11 rounded-xl border border-[#e2dacb] bg-white px-3 font-normal outline-none focus:border-[#aa6418]"
              type="number"
              min="0"
              name="budget"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#514b3f] sm:col-span-2">
            Preferences
            <textarea
              className="min-h-20 rounded-xl border border-[#e2dacb] bg-white p-3 font-normal outline-none focus:border-[#aa6418]"
              name="preferences"
              placeholder="e.g. Suprabhata Seva, senior-citizen friendly darshan"
            />
          </label>
          {errorMessage && (
            <p
              className="rounded-xl border border-[#f2d5ce] bg-[#fff1ed] p-3 text-sm leading-5 text-[#994b39] sm:col-span-2"
              role="alert"
            >
              {errorMessage}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
            <button
              type="button"
              className="min-h-11 rounded-xl px-4 text-sm font-medium text-[#756d5e] hover:bg-[#f5f0e7]"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="min-h-11 rounded-xl bg-[#aa6418] px-4 text-sm font-semibold text-white hover:bg-[#79440f] disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create Trip"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
