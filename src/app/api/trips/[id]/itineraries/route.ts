import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { created, errorResponse, success } from "@/lib/api/response"
import { validateCreateItineraryInput } from "@/lib/validation"
import { itineraryService } from "@/services/itineraries/itinerary.service"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    const itinerary = await itineraryService.getItineraryByTripId(id, user.id)
    return success(itinerary)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    const body = await parseJsonBody(request)
    const validated = validateCreateItineraryInput({
      ...(typeof body === "object" && body !== null ? body : {}),
      tripId: id,
    })
    const itinerary = await itineraryService.createItinerary(user.id, validated)
    return created(itinerary)
  } catch (error) {
    return errorResponse(error)
  }
}
