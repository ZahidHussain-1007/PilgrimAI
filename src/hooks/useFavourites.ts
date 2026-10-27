import { favouritesApi } from "../services/api/favourites.api"
import { useResource } from "./useResource"
export function useFavourites() {
  return useResource(favouritesApi.list)
}
