import { BadRequestError } from "./api/errors"
import type { CreateItineraryInput } from "@/types/api/inputs"

export function validateRequiredString(
  value: unknown,
  fieldName: string,
  minLength = 1,
  maxLength = 500,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestError(`${fieldName} is required and must be a non-empty string`)
  }
  const trimmed = value.trim()
  if (trimmed.length < minLength) {
    throw new BadRequestError(
      `${fieldName} must be at least ${minLength} characters long`,
    )
  }
  if (trimmed.length > maxLength) {
    throw new BadRequestError(
      `${fieldName} cannot exceed ${maxLength} characters`,
    )
  }
  return trimmed
}

export function validateOptionalString(
  value: unknown,
  fieldName: string,
  maxLength = 2000,
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") {
    throw new BadRequestError(`${fieldName} must be a string`)
  }
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > maxLength) {
    throw new BadRequestError(
      `${fieldName} cannot exceed ${maxLength} characters`,
    )
  }
  return trimmed
}

export function validateOptionalNumber(
  value: unknown,
  fieldName: string,
  min = 0,
  max = 1000000000,
): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequestError(`${fieldName} must be a valid number`)
  }
  if (value < min || value > max) {
    throw new BadRequestError(
      `${fieldName} must be between ${min} and ${max}`,
    )
  }
  return value
}

export function validateOptionalStringArray(
  value: unknown,
  fieldName: string,
  maxItems = 50,
): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${fieldName} must be an array of strings`)
  }
  if (value.length > maxItems) {
    throw new BadRequestError(
      `${fieldName} cannot exceed ${maxItems} items`,
    )
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
}

export function validateCreateTripInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new BadRequestError("Trip input must be an object")
  }
  const raw = data as Record<string, unknown>
  const title = validateRequiredString(raw.title, "Trip title", 1, 200)
  const origin = validateOptionalString(raw.origin, "Origin", 200)
  const destinations = validateOptionalStringArray(raw.destinations, "Destinations")
  const startDate = validateOptionalString(raw.startDate, "Start date", 50)
  const endDate = validateOptionalString(raw.endDate, "End date", 50)
  const travellers = validateOptionalNumber(
    raw.travellers ?? raw.travelers,
    "Travellers",
    1,
    100,
  )
  const budget = validateOptionalNumber(raw.budget, "Budget", 0, 100000000)
  const preferences = validateOptionalStringArray(raw.preferences, "Preferences") ?? []
  const constraints = validateOptionalStringArray(raw.constraints, "Constraints")
  const status = validateOptionalString(raw.status, "Status", 50) || "planning"

  return {
    title,
    origin,
    destinations,
    startDate,
    endDate,
    travellers,
    budget,
    preferences,
    constraints,
    status,
  }
}

export function validateUpdateTripInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new BadRequestError("Trip update input must be an object")
  }
  const raw = data as Record<string, unknown>
  return {
    title: raw.title !== undefined ? validateRequiredString(raw.title, "Trip title", 1, 200) : undefined,
    origin: validateOptionalString(raw.origin, "Origin", 200),
    destinations: validateOptionalStringArray(raw.destinations, "Destinations"),
    startDate: validateOptionalString(raw.startDate, "Start date", 50),
    endDate: validateOptionalString(raw.endDate, "End date", 50),
    travellers: validateOptionalNumber(
      raw.travellers ?? raw.travelers,
      "Travellers",
      1,
      100,
    ),
    budget: validateOptionalNumber(raw.budget, "Budget", 0, 100000000),
    preferences: validateOptionalStringArray(raw.preferences, "Preferences"),
    constraints: validateOptionalStringArray(raw.constraints, "Constraints"),
    status: validateOptionalString(raw.status, "Status", 50),
  }
}

export function validateCreateItineraryInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new BadRequestError("Itinerary input must be an object")
  }
  const raw = data as Record<string, unknown>
  return {
    tripId: validateOptionalString(raw.tripId, "Trip ID", 100),
    title: validateRequiredString(raw.title, "Itinerary title", 1, 200),
    // audit C01: days MUST survive validation — dropping them here meant
    // every create call silently produced an empty itinerary.
    days: validateItineraryDays(raw.days),
    estimatedCost: validateOptionalNumber(raw.estimatedCost, "Estimated cost", 0, 100000000),
    currency: validateOptionalString(raw.currency, "Currency", 10) || "INR",
  }
}

function validateItineraryDays(value: unknown): CreateItineraryInput["days"] {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) {
    throw new BadRequestError("Itinerary days must be an array")
  }
  if (value.length > 60) {
    throw new BadRequestError("Itinerary days cannot exceed 60")
  }
  let totalActivities = 0
  return value.map((rawDay, index) => {
    if (typeof rawDay !== "object" || rawDay === null || Array.isArray(rawDay)) {
      throw new BadRequestError(`Day ${index + 1} must be an object`)
    }
    const day = rawDay as Record<string, unknown>
    const rawActivities = day.activities
    // v15 (audit N01): a non-array `activities` was silently mapped to []
    // — malformed input must be rejected, never emptied.
    if (
      rawActivities !== undefined &&
      rawActivities !== null &&
      !Array.isArray(rawActivities)
    ) {
      throw new BadRequestError(
        `Day ${index + 1} activities must be an array`,
      )
    }
    const activities = (Array.isArray(rawActivities) ? rawActivities : []).map(
      (rawActivity, activityIndex) => {
        if (typeof rawActivity !== "object" || rawActivity === null) {
          throw new BadRequestError(
            `Day ${index + 1} activity ${activityIndex + 1} must be an object`,
          )
        }
        const activity = rawActivity as Record<string, unknown>
        const validated = validateCreateItineraryItemInput(activity)
        return {
          ...validated,
          dayNumber: index + 1,
        }
      },
    )
    if (activities.length > 40) {
      throw new BadRequestError(`Day ${index + 1} cannot exceed 40 activities`)
    }
    totalActivities += activities.length
    if (totalActivities > 200) {
      throw new BadRequestError("Itinerary cannot exceed 200 activities total")
    }
    return {
      label: validateOptionalString(day.label, "Day label", 100) || `Day ${index + 1}`,
      activities,
    }
  })
}

export function validateCreateItineraryItemInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new BadRequestError("Itinerary item input must be an object")
  }
  const raw = data as Record<string, unknown>
  return {
    dayLabel: validateOptionalString(raw.dayLabel, "Day label", 100) || "Day 1",
    // audit C02: keep the caller's dayNumber and location — dropping them
    // forced every activity onto day 1 with no location.
    dayNumber: (() => {
      const n = validateOptionalNumber(raw.dayNumber, "Day number", 1, 60)
      if (n !== undefined && !Number.isInteger(n)) {
        throw new BadRequestError("Day number must be a whole number")
      }
      return n
    })(),
    location: validateOptionalString(raw.location, "Location", 200),
    title: validateRequiredString(raw.title, "Activity title", 1, 200),
    kind: validateOptionalString(raw.kind, "Activity kind", 50) || "darshan",
    startTime: validateOptionalString(raw.startTime, "Start time", 20),
    endTime: validateOptionalString(raw.endTime, "End time", 20),
    description: validateOptionalString(raw.description, "Description", 1000),
    estimatedCost: validateOptionalNumber(raw.estimatedCost, "Estimated cost", 0, 1000000),
    currency: validateOptionalString(raw.currency, "Currency", 10) || "INR",
  }
}

export function validateCreateConversationInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    return { title: "New Conversation" }
  }
  const raw = data as Record<string, unknown>
  return {
    title: validateOptionalString(raw.title, "Conversation title", 200) || "New Conversation",
  }
}

export function validateCreateMessageInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new BadRequestError("Message input must be an object")
  }
  const raw = data as Record<string, unknown>
  const content = validateRequiredString(raw.content || raw.message, "Message content", 1, 5000)
  const conversationId = validateOptionalString(raw.conversationId, "Conversation ID", 100)
  const temple = validateOptionalString(raw.temple, "Temple", 100)
  const language = validateOptionalString(raw.language, "Language", 20) || "en"

  return {
    content,
    conversationId,
    temple,
    language,
  }
}

export function validateCreateFavouriteInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new BadRequestError("Favourite input must be an object")
  }
  const raw = data as Record<string, unknown>
  const title = validateRequiredString(raw.title, "Title", 1, 200)
  const type = validateOptionalString(raw.type, "Type", 50) as
    | "temple"
    | "hotel"
    | "restaurant"
    | "place"
    | undefined

  return {
    title,
    type: type || "temple",
    templeId: validateOptionalString(raw.templeId, "Temple ID", 100),
    notes: validateOptionalString(raw.notes, "Notes", 1000),
  }
}
