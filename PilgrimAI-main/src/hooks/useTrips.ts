import { tripsApi } from "../services/api/trips.api"
import { useResource } from "./useResource"
export function useTrips() {
  return useResource(tripsApi.list)
}
