import { createClient } from "../../lib/supabase/server"
import { NotFoundError } from "../../lib/api/errors"
import type { Trip } from "../../types/domain/models"
import type { CreateTripInput, UpdateTripInput } from "../../types/api/inputs"
import { itineraryService } from "../itineraries/itinerary.service"

export class TripService {
  async listTrips(userId: string): Promise<Trip[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error(`Failed to list trips: ${error.message}`)
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      origin: row.origin ?? undefined,
      destinations: row.destinations ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      travellers: row.travelers ?? undefined,
      budget: row.budget ?? undefined,
      preferences: row.preferences ?? undefined,
      constraints: row.constraints ?? undefined,
      status: row.status ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async getTrip(id: string, userId: string): Promise<Trip | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to get trip: ${error.message}`)
    }

    if (!data) return null

    const trip: Trip = {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      origin: data.origin ?? undefined,
      destinations: data.destinations ?? undefined,
      startDate: data.start_date ?? undefined,
      endDate: data.end_date ?? undefined,
      travellers: data.travelers ?? undefined,
      budget: data.budget ?? undefined,
      preferences: data.preferences ?? undefined,
      constraints: data.constraints ?? undefined,
      status: data.status ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }

    const itinerary = await itineraryService.getItineraryByTripId(id, userId)
    if (itinerary) {
      trip.itinerary = itinerary
    }

    return trip
  }

  async createTrip(userId: string, input: CreateTripInput): Promise<Trip> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("trips")
      .insert({
        id,
        user_id: userId,
        title: input.title,
        origin: input.origin || null,
        destinations: input.destinations || null,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
        travelers: input.travellers ?? null,
        budget: input.budget || null,
        preferences: input.preferences ?? [],
        constraints: input.constraints || null,
        status: input.status || "planning",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create trip: ${error.message}`)
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      origin: data.origin ?? undefined,
      destinations: data.destinations ?? undefined,
      startDate: data.start_date ?? undefined,
      endDate: data.end_date ?? undefined,
      travellers: data.travelers ?? undefined,
      budget: data.budget ?? undefined,
      preferences: data.preferences ?? [],
      constraints: data.constraints ?? undefined,
      status: data.status ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async updateTrip(
    id: string,
    userId: string,
    input: UpdateTripInput,
  ): Promise<Trip> {
    const existing = await this.getTrip(id, userId)
    if (!existing) {
      throw new NotFoundError("Trip not found")
    }

    const now = new Date().toISOString()
    const supabase = await createClient()

    const updatePayload: Record<string, unknown> = {
      updated_at: now,
    }

    if (input.title !== undefined) updatePayload.title = input.title
    if (input.origin !== undefined) updatePayload.origin = input.origin || null
    if (input.destinations !== undefined)
      updatePayload.destinations = input.destinations || null
    if (input.startDate !== undefined)
      updatePayload.start_date = input.startDate || null
    if (input.endDate !== undefined)
      updatePayload.end_date = input.endDate || null
    if (input.travellers !== undefined)
      updatePayload.travelers = input.travellers ?? null
    if (input.budget !== undefined)
      updatePayload.budget = input.budget ?? null
    if (input.preferences !== undefined)
      updatePayload.preferences = input.preferences ?? []
    if (input.constraints !== undefined)
      updatePayload.constraints = input.constraints || null
    if (input.status !== undefined)
      updatePayload.status = input.status || null

    const { data, error } = await supabase
      .from("trips")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update trip: ${error.message}`)
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      origin: data.origin ?? undefined,
      destinations: data.destinations ?? undefined,
      startDate: data.start_date ?? undefined,
      endDate: data.end_date ?? undefined,
      travellers: data.travelers ?? undefined,
      budget: data.budget ?? undefined,
      preferences: data.preferences ?? [],
      constraints: data.constraints ?? undefined,
      status: data.status ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async deleteTrip(id: string, userId: string): Promise<void> {
    const existing = await this.getTrip(id, userId)
    if (!existing) {
      throw new NotFoundError("Trip not found")
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("trips")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)

    if (error) {
      throw new Error(`Failed to delete trip: ${error.message}`)
    }
  }
}

export const tripService = new TripService()
