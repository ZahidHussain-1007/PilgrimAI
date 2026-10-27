import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { created, errorResponse, success } from "@/lib/api/response"
import { validateCreateTripInput } from "@/lib/validation"
import { tripService } from "@/services/trips/trip.service"

export async function GET() {
  try {
    const { user } = await requireAuthContext()
    const trips = await tripService.listTrips(user.id)
    return success(trips)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuthContext()
    const body = await parseJsonBody(request)
    const validated = validateCreateTripInput(body)
    const trip = await tripService.createTrip(user.id, validated)
    return created(trip)
  } catch (error) {
    return errorResponse(error)
  }
}
