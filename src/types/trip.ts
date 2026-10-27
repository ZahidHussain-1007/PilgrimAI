import type { ItineraryViewModel } from "./itinerary"

export type Trip = {
  id: string
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
  itinerary?: ItineraryViewModel
}
