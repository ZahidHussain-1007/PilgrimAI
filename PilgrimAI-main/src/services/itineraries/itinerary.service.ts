import { createClient } from "../../lib/supabase/server"
import { NotFoundError } from "../../lib/api/errors"
import type {
  Itinerary,
  ItineraryActivity,
  ItineraryDay,
} from "../../types/domain/models"
import type {
  CreateItineraryInput,
  CreateItineraryItemInput,
} from "../../types/api/inputs"

export class ItineraryService {
  async listItineraries(userId: string): Promise<Itinerary[]> {
    const supabase = await createClient()

    // Find all trips owned by user
    const { data: userTrips, error: tripsError } = await supabase
      .from("trips")
      .select("id, title")
      .eq("user_id", userId)

    if (tripsError) {
      throw new Error(`Failed to list itineraries: ${tripsError.message}`)
    }

    if (!userTrips || userTrips.length === 0) {
      return []
    }

    const tripIds = userTrips.map((t) => t.id)
    const tripTitleMap = new Map(userTrips.map((t) => [t.id, t.title]))

    const { data: itineraries, error: itinError } = await supabase
      .from("itineraries")
      .select("*")
      .in("trip_id", tripIds)
      .order("created_at", { ascending: false })

    if (itinError) {
      throw new Error(`Failed to list itineraries: ${itinError.message}`)
    }

    if (!itineraries || itineraries.length === 0) {
      return []
    }

    return Promise.all(
      itineraries.map(async (row) => {
        const items = await this.getItems(row.id)
        const totalCost = items.reduce(
          (sum, item) => sum + (item.estimatedCost || 0),
          0,
        )
        const title = row.trip_id
          ? tripTitleMap.get(row.trip_id) || "Trip Itinerary"
          : "Itinerary"

        return {
          id: row.id,
          tripId: row.trip_id ?? undefined,
          userId,
          title,
          days: this.groupActivitiesByDay(items),
          estimatedCost: totalCost > 0 ? totalCost : undefined,
          currency: "INR",
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      }),
    )
  }

  async getItinerary(id: string, userId: string): Promise<Itinerary | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to get itinerary: ${error.message}`)
    }

    if (!data) return null

    // If linked to a trip, verify user ownership of the trip
    let tripTitle = "Itinerary"
    if (data.trip_id) {
      const { data: trip } = await supabase
        .from("trips")
        .select("user_id, title")
        .eq("id", data.trip_id)
        .maybeSingle()

      if (trip) {
        if (trip.user_id !== userId) {
          throw new NotFoundError("Itinerary not found")
        }
        tripTitle = trip.title
      }
    }

    const items = await this.getItems(id)
    const totalCost = items.reduce(
      (sum, item) => sum + (item.estimatedCost || 0),
      0,
    )

    return {
      id: data.id,
      tripId: data.trip_id ?? undefined,
      userId,
      title: tripTitle,
      days: this.groupActivitiesByDay(items),
      estimatedCost: totalCost > 0 ? totalCost : undefined,
      currency: "INR",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async getItineraryByTripId(
    tripId: string,
    userId: string,
  ): Promise<Itinerary | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("itineraries")
      .select("*")
      .eq("trip_id", tripId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to get itinerary by trip: ${error.message}`)
    }

    if (!data) return null

    const items = await this.getItems(data.id)
    const totalCost = items.reduce(
      (sum, item) => sum + (item.estimatedCost || 0),
      0,
    )

    return {
      id: data.id,
      tripId: data.trip_id ?? undefined,
      userId,
      title: "Trip Itinerary",
      days: this.groupActivitiesByDay(items),
      estimatedCost: totalCost > 0 ? totalCost : undefined,
      currency: "INR",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async createItinerary(
    userId: string,
    input: CreateItineraryInput,
  ): Promise<Itinerary> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const supabase = await createClient()

    if (input.tripId) {
      const { data: trip, error: tripErr } = await supabase
        .from("trips")
        .select("id")
        .eq("id", input.tripId)
        .eq("user_id", userId)
        .maybeSingle()

      if (tripErr || !trip) {
        throw new NotFoundError("Associated trip not found or unauthorized")
      }
    }

    const { data, error } = await supabase
      .from("itineraries")
      .insert({
        id,
        trip_id: input.tripId || null,
        status: "planning",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create itinerary: ${error.message}`)
    }

    const createdItems: ItineraryActivity[] = []
    if (input.days && Array.isArray(input.days)) {
      for (let dayIdx = 0; dayIdx < input.days.length; dayIdx++) {
        const day = input.days[dayIdx]
        const dayNumber = dayIdx + 1
        for (const act of day.activities || []) {
          const item = await this.addItem(data.id, userId, {
            dayNumber,
            title: act.title,
            location: (act as any).location,
            startTime: act.startTime,
            endTime: act.endTime,
            description: act.description,
            estimatedCost: act.estimatedCost,
          })
          createdItems.push(item)
        }
      }
    }

    return {
      id: data.id,
      tripId: data.trip_id ?? undefined,
      userId,
      title: input.title || "Trip Itinerary",
      days: this.groupActivitiesByDay(createdItems),
      estimatedCost: input.estimatedCost,
      currency: input.currency || "INR",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async deleteItinerary(id: string, userId: string): Promise<void> {
    const existing = await this.getItinerary(id, userId)
    if (!existing) {
      throw new NotFoundError("Itinerary not found")
    }

    const supabase = await createClient()
    const { error } = await supabase.from("itineraries").delete().eq("id", id)

    if (error) {
      throw new Error(`Failed to delete itinerary: ${error.message}`)
    }
  }

  async addItem(
    itineraryId: string,
    _userId: string,
    input: CreateItineraryItemInput & { dayNumber?: number; location?: string },
  ): Promise<ItineraryActivity> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const supabase = await createClient()

    let dayNumber = input.dayNumber
    if (!dayNumber && input.dayLabel) {
      const match = input.dayLabel.match(/\d+/)
      dayNumber = match ? parseInt(match[0], 10) : 1
    }
    if (!dayNumber) dayNumber = 1

    const { data, error } = await supabase
      .from("itinerary_items")
      .insert({
        id,
        itinerary_id: itineraryId,
        day_number: dayNumber,
        title: input.title,
        location: input.location || null,
        start_time: input.startTime || null,
        end_time: input.endTime || null,
        description: input.description || null,
        // audit C04: `||` turned a legitimate ₹0 estimate into null
        estimated_cost: input.estimatedCost ?? null,
        created_at: now,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to add itinerary item: ${error.message}`)
    }

    return {
      id: data.id,
      title: data.title,
      // audit C03: dayNumber/location MUST round-trip or the UI collapses
      // every activity onto "Day 1" after a save/reload.
      dayNumber: data.day_number ?? 1,
      location: data.location ?? undefined,
      startTime: data.start_time ?? undefined,
      endTime: data.end_time ?? undefined,
      description: data.description ?? undefined,
      estimatedCost: data.estimated_cost ?? undefined,
      currency: "INR",
    }
  }

  private async getItems(itineraryId: string): Promise<
    (ItineraryActivity & { dayNumber: number })[]
  > {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("itinerary_id", itineraryId)
      .order("day_number", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) {
      throw new Error(`Failed to get itinerary items: ${error.message}`)
    }

    return (data || []).map((row) => ({
      id: row.id,
      dayNumber: row.day_number,
      title: row.title,
      startTime: row.start_time ?? undefined,
      endTime: row.end_time ?? undefined,
      description: row.description ?? undefined,
      estimatedCost: row.estimated_cost ?? undefined,
      currency: "INR",
    }))
  }

  private groupActivitiesByDay(
    items: (ItineraryActivity & { dayNumber?: number })[],
  ): ItineraryDay[] {
    const dayMap = new Map<number, ItineraryActivity[]>()

    for (const item of items) {
      const dayNum = item.dayNumber || 1
      if (!dayMap.has(dayNum)) {
        dayMap.set(dayNum, [])
      }
      dayMap.get(dayNum)!.push({
        id: item.id,
        title: item.title,
        kind: item.kind,
        startTime: item.startTime,
        endTime: item.endTime,
        description: item.description,
        estimatedCost: item.estimatedCost,
        currency: item.currency || "INR",
      })
    }

    const sortedDays = Array.from(dayMap.keys()).sort((a, b) => a - b)

    if (sortedDays.length === 0) {
      return []
    }

    return sortedDays.map((dayNum) => ({
      id: `day-${dayNum}`,
      label: `Day ${dayNum}`,
      activities: dayMap.get(dayNum) || [],
    }))
  }
}

export const itineraryService = new ItineraryService()
