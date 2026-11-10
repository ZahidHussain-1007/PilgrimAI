import { requireAuthContext } from "@/lib/auth/require-context"
import { errorResponse, noContent } from "@/lib/api/response"
import { favouriteService } from "@/services/favourites/favourite.service"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    await favouriteService.removeFavourite(id, user.id)
    return noContent()
  } catch (error) {
    return errorResponse(error)
  }
}
