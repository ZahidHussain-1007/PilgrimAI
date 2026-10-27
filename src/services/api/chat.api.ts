import { request } from "./client"
import type { Message } from "../../types/message"

export const chatApi = {
  send: async (message: string, conversationId?: string): Promise<Message> => {
    return request<Message>("/chat", {
      method: "POST",
      body: JSON.stringify({
        content: message,
        conversationId: conversationId || undefined,
      }),
    })
  },
}
