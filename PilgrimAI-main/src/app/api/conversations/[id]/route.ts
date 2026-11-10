import { requireAuthContext } from "@/lib/auth/require-context"
import { errorResponse, noContent, success } from "@/lib/api/response"
import { NotFoundError } from "@/lib/api/errors"
import { conversationService } from "@/services/conversations/conversation.service"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    const result = await conversationService.getConversation(id, user.id)
    if (!result) {
      throw new NotFoundError("Conversation not found")
    }
    return success(result.conversation)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params
    await conversationService.deleteConversation(id, user.id)
    return noContent()
  } catch (error) {
    return errorResponse(error)
  }
}
