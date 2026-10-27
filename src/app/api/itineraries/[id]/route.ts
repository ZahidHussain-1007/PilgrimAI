import { requireAuthContext } from "@/lib/auth/require-context"
import { errorResponse, noContent, success } from "@/lib/api/response"
import { NotFoundError } from "@/lib/api/errors"
import { itineraryService } from "@/services/itineraries/itinerary.service"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    const itinerary = await itineraryService.getItinerary(id, user.id)
    if (!itinerary) {
      throw new NotFoundError("Itinerary not found")
    }
    return success(itinerary)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    await itineraryService.deleteItinerary(id, user.id)
    return noContent()
  } catch (error) {
    return errorResponse(error)
  }
}
