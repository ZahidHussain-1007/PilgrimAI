import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { created, errorResponse, success } from "@/lib/api/response"
import { validateCreateItineraryInput } from "@/lib/validation"
import { itineraryService } from "@/services/itineraries/itinerary.service"

export async function GET() {
  try {
    const { user } = await requireAuthContext()
    const itineraries = await itineraryService.listItineraries(user.id)
    return success(itineraries)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuthContext()
    const body = await parseJsonBody(request)
    const validated = validateCreateItineraryInput(body)
    const itinerary = await itineraryService.createItinerary(user.id, validated)
    return created(itinerary)
  } catch (error) {
    return errorResponse(error)
  }
}
