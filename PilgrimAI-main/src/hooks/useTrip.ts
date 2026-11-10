import { useCallback } from "react"
import { tripsApi } from "../services/api/trips.api"
import { useResource } from "./useResource"
export function useTrip(id: string) {
  const load = useCallback(() => tripsApi.get(id), [id])
  return useResource(load)
}
