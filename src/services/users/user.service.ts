import { createClient } from "../../lib/supabase/server"
import type { User } from "../../types/domain/models"

export class UserService {
  async getProfile(userId: string): Promise<User | null> {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    if (user.id !== userId) {
      return null
    }

    return {
      id: user.id,
      email: user.email ?? undefined,
      name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0],
      avatarUrl: user.user_metadata?.avatar_url ?? undefined,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }
  }

  async upsertProfile(user: Partial<User> & { id: string }): Promise<User> {
    const supabase = await createClient()
    const updateData: Record<string, unknown> = {}
    if (user.name !== undefined) updateData.full_name = user.name
    if (user.avatarUrl !== undefined) updateData.avatar_url = user.avatarUrl

    const {
      data: { user: updatedUser },
      error,
    } = await supabase.auth.updateUser({
      data: updateData,
    })

    if (error || !updatedUser) {
      throw new Error(
        `Failed to update profile: ${error?.message || "User not found"}`,
      )
    }

    return {
      id: updatedUser.id,
      email: updatedUser.email ?? undefined,
      name:
        updatedUser.user_metadata?.full_name ||
        updatedUser.user_metadata?.name ||
        updatedUser.email?.split("@")[0],
      avatarUrl: updatedUser.user_metadata?.avatar_url ?? undefined,
      createdAt: updatedUser.created_at,
      updatedAt: updatedUser.updated_at,
    }
  }
}

export const userService = new UserService()
