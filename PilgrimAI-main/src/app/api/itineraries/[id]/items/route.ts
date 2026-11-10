import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { created, errorResponse } from "@/lib/api/response"
import { validateCreateItineraryItemInput } from "@/lib/validation"
import { itineraryService } from "@/services/itineraries/itinerary.service"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    const body = await parseJsonBody(request)
    const validated = validateCreateItineraryItemInput(body)
    const item = await itineraryService.addItem(id, user.id, validated)
    return created(item)
  } catch (error) {
    return errorResponse(error)
  }
}
