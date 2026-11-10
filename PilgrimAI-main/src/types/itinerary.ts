/** UI view model only; this does not define the backend itinerary response contract. */
export type ItineraryActivityViewModel = {
  id?: string
  title?: string
  kind?: string
  startTime?: string
  endTime?: string
  description?: string
  estimatedCost?: number
  currency?: string
}

export type ItineraryDayViewModel = {
  id?: string
  label?: string
  activities?: ItineraryActivityViewModel[]
}

export type ItineraryValidationViewModel = {
  status?: string
  detail?: string
}

export type ItineraryViewModel = {
  id?: string
  title?: string
  days?: ItineraryDayViewModel[]
  estimatedCost?: number
  currency?: string
  validation?: ItineraryValidationViewModel
}
