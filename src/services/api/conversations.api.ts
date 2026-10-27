import { request } from "./client"
import type { Conversation } from "../../types/conversation"
export const conversationsApi = {
  list: async () =>
    (await request<Conversation[] | undefined>("/conversations")) ?? [],
  get: (id: string) =>
    request<Conversation>(`/conversations/${encodeURIComponent(id)}`),
  create: () => request<Conversation>("/conversations", { method: "POST" }),
  remove: (id: string) =>
    request<void>(`/conversations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
}
