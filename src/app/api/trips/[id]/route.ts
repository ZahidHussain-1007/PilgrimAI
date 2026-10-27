import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { errorResponse, noContent, success } from "@/lib/api/response"
import { NotFoundError } from "@/lib/api/errors"
import { validateUpdateTripInput } from "@/lib/validation"
import { tripService } from "@/services/trips/trip.service"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    const trip = await tripService.getTrip(id, user.id)
    if (!trip) {
      throw new NotFoundError("Trip not found")
    }
    return success(trip)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    const body = await parseJsonBody(request)
    const validated = validateUpdateTripInput(body)
    const updated = await tripService.updateTrip(id, user.id, validated)
    return success(updated)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return PUT(request, context)
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    await tripService.deleteTrip(id, user.id)
    return noContent()
  } catch (error) {
    return errorResponse(error)
  }
}
