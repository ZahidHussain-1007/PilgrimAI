import { request } from "./client"
import type { ItineraryViewModel as Itinerary } from "../../types/itinerary"

export const itinerariesApi = {
  list: () => request<Itinerary[] | undefined>("/itineraries"),
  get: (id: string) =>
    request<Itinerary>(`/itineraries/${encodeURIComponent(id)}`),
  create: (data: Partial<Itinerary>) =>
    request<Itinerary>("/itineraries", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/itineraries/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
}
