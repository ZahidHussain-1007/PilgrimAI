import type { Favourite } from "../domain/models"

export interface CreateTripInput {
  title: string
  origin?: string
  destinations?: string[]
  startDate?: string
  endDate?: string
  travellers?: number
  budget?: number
  preferences?: string[]
  constraints?: string[]
  status?: string
}

export interface UpdateTripInput {
  title?: string
  origin?: string
  destinations?: string[]
  startDate?: string
  endDate?: string
  travellers?: number
  budget?: number
  preferences?: string[]
  constraints?: string[]
  status?: string
}

export interface CreateItineraryInput {
  tripId?: string
  title?: string
  days?: {
    label?: string
    activities?: {
      title: string
      /** stamped by validation from the day index (audit C01/C03) */
      dayNumber?: number
      location?: string
      kind?: string
      startTime?: string
      endTime?: string
      description?: string
      estimatedCost?: number
    }[]
  }[]
  estimatedCost?: number
  currency?: string
}

export interface CreateItineraryItemInput {
  dayLabel?: string
  dayNumber?: number
  location?: string
  title: string
  kind?: string
  startTime?: string
  endTime?: string
  description?: string
  estimatedCost?: number
  currency?: string
}

export interface CreateConversationInput {
  title?: string
}

export interface CreateMessageInput {
  content: string
  conversationId?: string
  temple?: string
  language?: string
}

export interface AddFavouriteInput {
  title: string
  type: Favourite["type"]
  templeId?: string
  notes?: string
}
