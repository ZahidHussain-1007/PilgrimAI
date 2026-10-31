import { parseJsonBody } from "@/lib/api/request"
import { errorResponse, success } from "@/lib/api/response"
import { getAuthContext } from "@/lib/auth/context"
import { validateCreateMessageInput } from "@/lib/validation"
import { NotFoundError, UnauthorizedError } from "@/lib/api/errors"
import { aiService } from "@/services/ai/ai.service"
import { conversationService } from "@/services/conversations/conversation.service"

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const validated = validateCreateMessageInput(body)
    const { user } = await getAuthContext()

    let conversationId = validated.conversationId

    // If conversationId is specified, ensure security & isolation
    if (conversationId) {
      if (!user) {
        throw new UnauthorizedError("You must be signed in to access this conversation")
      }
      const existing = await conversationService.getConversation(conversationId, user.id)
      if (!existing) {
        throw new NotFoundError("Conversation not found")
      }
    }

    if (user && !conversationId) {
      const conv = await conversationService.createConversation(user.id, {
        title: validated.content.slice(0, 50),
      })
      conversationId = conv.id
    }

    if (user && conversationId) {
      await conversationService.addMessage(conversationId, {
        conversationId,
        userId: user.id,
        role: "user",
        content: validated.content,
      })
    }

    const reply = await aiService.generateResponse({
      message: validated.content,
      conversationId,
      // v17: anonymous sessions keep ONE backend session id so the brain
      // sees previous turns (conversationId covers signed-in users).
      sessionId: validated.sessionId,
      userId: user?.id,
      temple: validated.temple,
      language: validated.language,
    })

    if (user && conversationId) {
      await conversationService.addMessage(conversationId, {
        conversationId,
        userId: user.id,
        role: "assistant",
        content: reply.content,
        sources: reply.sources,
        followUpQuestions: reply.followUpQuestions,
        trip: reply.trip,
      })
    }

    return success({
      ...reply,
      conversationId: conversationId || reply.conversationId,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
