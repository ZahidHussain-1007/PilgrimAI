import { request } from "./client"
import type { Trip } from "../../types/trip"
import { adaptTripList, adaptTripResponse } from "./tripAdapter"

export const tripsApi = {
  list: async () => adaptTripList(await request<unknown>("/trips")),
  get: async (id: string) =>
    adaptTripResponse(await request<unknown>(`/trips/${encodeURIComponent(id)}`)),
  create: async (data: Partial<Trip>) =>
    adaptTripResponse(
      await request<unknown>("/trips", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ),
  update: async (id: string, data: Partial<Trip>) =>
    adaptTripResponse(
      await request<unknown>(`/trips/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    ),
  remove: (id: string) =>
    request<void>(`/trips/${encodeURIComponent(id)}`, { method: "DELETE" }),
}
