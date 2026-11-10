import { itinerariesApi } from "../services/api/itineraries.api"
import { useResource } from "./useResource"
export function useItineraries() {
  return useResource(itinerariesApi.list)
}
