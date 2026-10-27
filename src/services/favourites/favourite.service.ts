import { createClient } from "../../lib/supabase/server"
import type { Favourite } from "../../types/domain/models"
import type { AddFavouriteInput } from "../../types/api/inputs"

export class FavouriteService {
  async listFavourites(userId: string): Promise<Favourite[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("favourites")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error(`Failed to list favourites: ${error.message}`)
    }

    return (data || []).map((row) => {
      const meta = (row.metadata as Record<string, unknown>) || {}
      return {
        id: row.id,
        userId: row.user_id,
        title: (meta.title as string) || row.item_id,
        type: row.item_type as Favourite["type"],
        templeId: row.item_id,
        notes: (meta.notes as string) ?? undefined,
        createdAt: row.created_at,
      }
    })
  }

  async addFavourite(
    userId: string,
    input: AddFavouriteInput,
  ): Promise<Favourite> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const supabase = await createClient()

    const metadata: Record<string, unknown> = {
      title: input.title,
    }
    if (input.notes) metadata.notes = input.notes

    const { data, error } = await supabase
      .from("favourites")
      .insert({
        id,
        user_id: userId,
        item_type: input.type || "temple",
        item_id: input.templeId || input.title,
        metadata: metadata as any,
        created_at: now,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to add favourite: ${error.message}`)
    }

    const meta = (data.metadata as Record<string, unknown>) || {}

    return {
      id: data.id,
      userId: data.user_id,
      title: (meta.title as string) || data.item_id,
      type: data.item_type as Favourite["type"],
      templeId: data.item_id,
      notes: (meta.notes as string) ?? undefined,
      createdAt: data.created_at,
    }
  }

  async removeFavourite(id: string, userId: string): Promise<void> {
    const supabase = await createClient()
    const { error } = await supabase
      .from("favourites")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)

    if (error) {
      throw new Error(`Failed to remove favourite: ${error.message}`)
    }
  }
}

export const favouriteService = new FavouriteService()
