import { createClient } from "../../lib/supabase/server"
import { NotFoundError } from "../../lib/api/errors"
import type { Conversation, Message } from "../../types/domain/models"
import type { CreateConversationInput } from "../../types/api/inputs"

export class ConversationService {
  async listConversations(userId: string): Promise<Conversation[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })

    if (error) {
      throw new Error(`Failed to list conversations: ${error.message}`)
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async getConversation(
    id: string,
    userId: string,
  ): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to get conversation: ${error.message}`)
    }

    if (!data) return null

    const conversation: Conversation = {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }

    const messages = await this.listMessages(id, userId)
    return { conversation, messages }
  }

  async createConversation(
    userId: string,
    input: CreateConversationInput,
  ): Promise<Conversation> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const title = input.title?.trim() || "New conversation"
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        id,
        user_id: userId,
        title,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`)
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async deleteConversation(id: string, userId: string): Promise<void> {
    const existing = await this.getConversation(id, userId)
    if (!existing) {
      throw new NotFoundError("Conversation not found")
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)

    if (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`)
    }
  }

  async listMessages(
    conversationId: string,
    _userId?: string,
  ): Promise<Message[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })

    if (error) {
      throw new Error(`Failed to list messages: ${error.message}`)
    }

    return (data || []).map((row) => {
      const meta = (row.metadata as Record<string, unknown>) || {}
      return {
        id: row.id,
        conversationId: row.conversation_id,
        userId: (meta.userId as string) ?? undefined,
        role: row.role as "user" | "assistant",
        content: row.content,
        sources: (meta.sources as Message["sources"]) ?? undefined,
        followUpQuestions:
          (meta.followUpQuestions as string[]) ?? undefined,
        trip: (meta.trip as Message["trip"]) ?? undefined,
        createdAt: row.created_at,
      }
    })
  }

  async addMessage(
    conversationId: string,
    message: Omit<Message, "id" | "createdAt">,
  ): Promise<Message> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const supabase = await createClient()

    const metadata: Record<string, unknown> = {}
    if (message.userId) metadata.userId = message.userId
    if (message.sources) metadata.sources = message.sources
    if (message.followUpQuestions)
      metadata.followUpQuestions = message.followUpQuestions
    if (message.trip) metadata.trip = message.trip

    const { data, error } = await supabase
      .from("messages")
      .insert({
        id,
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        metadata: metadata as any,
        created_at: now,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to add message: ${error.message}`)
    }

    // Touch updated_at on conversation
    await supabase
      .from("conversations")
      .update({ updated_at: now })
      .eq("id", conversationId)

    const meta = (data.metadata as Record<string, unknown>) || {}

    return {
      id: data.id,
      conversationId: data.conversation_id,
      userId: (meta.userId as string) ?? message.userId,
      role: data.role as "user" | "assistant",
      content: data.content,
      sources: (meta.sources as Message["sources"]) ?? message.sources,
      followUpQuestions:
        (meta.followUpQuestions as string[]) ?? message.followUpQuestions,
      trip: (meta.trip as Message["trip"]) ?? message.trip,
      createdAt: data.created_at,
    }
  }
}

export const conversationService = new ConversationService()
