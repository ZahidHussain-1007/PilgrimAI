export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      trips: {
        Row: {
          id: string
          user_id: string
          title: string
          origin: string | null
          destinations: string[] | null
          start_date: string | null
          end_date: string | null
          travelers: number | null
          budget: number | null
          preferences: string[] | null
          constraints: string[] | null
          status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          origin?: string | null
          destinations?: string[] | null
          start_date?: string | null
          end_date?: string | null
          travelers?: number | null
          budget?: number | null
          preferences?: string[] | null
          constraints?: string[] | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          origin?: string | null
          destinations?: string[] | null
          start_date?: string | null
          end_date?: string | null
          travelers?: number | null
          budget?: number | null
          preferences?: string[] | null
          constraints?: string[] | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      itineraries: {
        Row: {
          id: string
          trip_id: string | null
          status: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          trip_id?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          trip_id?: string | null
          status?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      itinerary_items: {
        Row: {
          id: string
          itinerary_id: string
          day_number: number
          title: string
          location: string | null
          start_time: string | null
          end_time: string | null
          description: string | null
          estimated_cost: number | null
          created_at: string
        }
        Insert: {
          id?: string
          itinerary_id: string
          day_number: number
          title: string
          location?: string | null
          start_time?: string | null
          end_time?: string | null
          description?: string | null
          estimated_cost?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          itinerary_id?: string
          day_number?: number
          title?: string
          location?: string | null
          start_time?: string | null
          end_time?: string | null
          description?: string | null
          estimated_cost?: number | null
          created_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: string
          content?: string
          metadata?: Json | null
          created_at?: string
        }
      }
      favourites: {
        Row: {
          id: string
          user_id: string
          item_type: string
          item_id: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          item_type: string
          item_id: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          item_type?: string
          item_id?: string
          metadata?: Json | null
          created_at?: string
        }
      }
    }
  }
}
