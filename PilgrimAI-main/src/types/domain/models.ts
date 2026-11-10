export interface User {
  id: string
  email?: string
  name?: string
  avatarUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface Trip {
  id: string
  userId: string
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
  itinerary?: Itinerary
  createdAt?: string
  updatedAt?: string
}

export interface ItineraryActivity {
  id: string
  itineraryId?: string
  dayLabel?: string
  /** audit C03: the numeric day must round-trip with the activity */
  dayNumber?: number
  title: string
  location?: string
  kind?: string
  startTime?: string
  endTime?: string
  description?: string
  estimatedCost?: number
  currency?: string
  createdAt?: string
}

export interface ItineraryDay {
  id?: string
  label: string
  activities: ItineraryActivity[]
}

export interface ItineraryValidation {
  status: string
  detail?: string
}

export interface Itinerary {
  id: string
  tripId?: string
  userId: string
  title: string
  days?: ItineraryDay[]
  estimatedCost?: number
  currency?: string
  validation?: ItineraryValidation
  createdAt?: string
  updatedAt?: string
}

export interface Conversation {
  id: string
  userId: string
  title: string
  createdAt?: string
  updatedAt?: string
}

export interface MessageSource {
  label: string
  href?: string
}

export interface TripCreated {
  id?: string
  title?: string
  destinations?: string[]
  dateSummary?: string
  description?: string
}

export interface Message {
  /** backend session id echoed back (anonymous history continuity) */
  sessionId?: string,
  id: string
  conversationId: string
  userId?: string
  role: "user" | "assistant"
  content: string
  sources?: MessageSource[]
  followUpQuestions?: string[]
  trip?: TripCreated
  createdAt: string
}

export interface Favourite {
  id: string
  userId: string
  title: string
  type: "temple" | "hotel" | "restaurant" | "place"
  templeId?: string
  notes?: string
  createdAt?: string
}
