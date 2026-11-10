import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { created, errorResponse, success } from "@/lib/api/response"
import { validateCreateFavouriteInput } from "@/lib/validation"
import { favouriteService } from "@/services/favourites/favourite.service"

export async function GET() {
  try {
    const { user } = await requireAuthContext()
    const items = await favouriteService.listFavourites(user.id)
    return success(items)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuthContext()
    const body = await parseJsonBody(request)
    const validated = validateCreateFavouriteInput(body)
    const item = await favouriteService.addFavourite(user.id, validated)
    return created(item)
  } catch (error) {
    return errorResponse(error)
  }
}
