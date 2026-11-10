import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { created, errorResponse, success } from "@/lib/api/response"
import { validateCreateConversationInput } from "@/lib/validation"
import { conversationService } from "@/services/conversations/conversation.service"

export async function GET() {
  try {
    const { user } = await requireAuthContext()
    const conversations = await conversationService.listConversations(user.id)
    return success(conversations)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAuthContext()
    let body = {}
    try {
      body = await parseJsonBody(request)
    } catch {
      // Body is optional for conversation creation
    }
    const validated = validateCreateConversationInput(body)
    const conversation = await conversationService.createConversation(
      user.id,
      validated,
    )
    return created(conversation)
  } catch (error) {
    return errorResponse(error)
  }
}
