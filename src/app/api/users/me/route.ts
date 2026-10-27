import { requireAuthContext } from "@/lib/auth/require-context"
import { errorResponse, success } from "@/lib/api/response"
import { parseJsonBody } from "@/lib/api/request"
import { userService } from "@/services/users/user.service"

export async function GET() {
  try {
    const { user } = await requireAuthContext()
    const profile = await userService.getProfile(user.id)
    return success(profile || user)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requireAuthContext()
    const body = await parseJsonBody(request)
    const updated = await userService.upsertProfile({
      id: user.id,
      email: user.email,
      ...(typeof body === "object" && body !== null ? body : {}),
    })
    return success(updated)
  } catch (error) {
    return errorResponse(error)
  }
}
