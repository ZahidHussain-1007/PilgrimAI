import { BadRequestError } from "./api/errors"

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
    estimatedCost: validateOptionalNumber(raw.estimatedCost, "Estimated cost", 0, 100000000),
    currency: validateOptionalString(raw.currency, "Currency", 10) || "INR",
  }
}

export function validateCreateItineraryItemInput(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new BadRequestError("Itinerary item input must be an object")
  }
  const raw = data as Record<string, unknown>
  return {
    dayLabel: validateOptionalString(raw.dayLabel, "Day label", 100) || "Day 1",
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
