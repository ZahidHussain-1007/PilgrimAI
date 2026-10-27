import { request } from "./client"
import type { Favourite } from "../../types/favourite"
export const favouritesApi = {
  list: async () =>
    (await request<Favourite[] | undefined>("/favourites")) ?? [],
  add: async (data: {
    title: string
    type?: string
    templeId?: string
    notes?: string
  }) =>
    request<Favourite>("/favourites", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/favourites/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
}
