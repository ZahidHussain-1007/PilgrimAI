import { conversationsApi } from "../services/api/conversations.api"
import { useResource } from "./useResource"
export function useConversations() {
  const resource = useResource(conversationsApi.list)
  return { ...resource, create: conversationsApi.create, remove: conversationsApi.remove }
}
