import { requireAuthContext } from "@/lib/auth/require-context"
import { parseJsonBody } from "@/lib/api/request"
import { created, errorResponse, success } from "@/lib/api/response"
import { NotFoundError } from "@/lib/api/errors"
import { validateCreateMessageInput } from "@/lib/validation"
import { conversationService } from "@/services/conversations/conversation.service"
import { aiService } from "@/services/ai/ai.service"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params

    const existing = await conversationService.getConversation(id, user.id)
    if (!existing) {
      throw new NotFoundError("Conversation not found")
    }

    const messages = await conversationService.listMessages(id, user.id)
    return success(messages)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user } = await requireAuthContext()
    const { id } = await context.params

    const existing = await conversationService.getConversation(id, user.id)
    if (!existing) {
      throw new NotFoundError("Conversation not found")
    }

    const body = await parseJsonBody(request)
    const validated = validateCreateMessageInput(body)

    // 1. Record user message
    await conversationService.addMessage(id, {
      conversationId: id,
      userId: user.id,
      role: "user",
      content: validated.content,
    })

    // 2. Generate assistant response
    const assistantReply = await aiService.generateResponse({
      message: validated.content,
      conversationId: id,
      userId: user.id,
      temple: validated.temple,
      language: validated.language,
    })

    // 3. Record assistant message
    const saved = await conversationService.addMessage(id, {
      conversationId: id,
      userId: user.id,
      role: "assistant",
      content: assistantReply.content,
      sources: assistantReply.sources,
      followUpQuestions: assistantReply.followUpQuestions,
      trip: assistantReply.trip,
    })

    return created(saved)
  } catch (error) {
    return errorResponse(error)
  }
}
