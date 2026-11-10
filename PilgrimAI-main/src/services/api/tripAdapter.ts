import type { Trip } from "../../types/trip"

type RecordValue = Record<string, unknown>
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value)
const readString = (record: RecordValue, key: string) => typeof record[key] === "string" ? record[key] as string : undefined
const readNumber = (record: RecordValue, key: string) => typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] as number : undefined
const readStringArray = (record: RecordValue, key: string) => Array.isArray(record[key]) ? record[key].filter((value): value is string => typeof value === "string") : undefined

/** Maps trip fields used by the UI. Itinerary mapping waits for its response contract. */
export function adaptTripResponse(value: unknown): Trip | null {
  if (!isRecord(value) || typeof value.id !== "string") return null
  return {
    id: value.id,
    title: readString(value, "title"),
    origin: readString(value, "origin"),
    destinations: readStringArray(value, "destinations"),
    startDate: readString(value, "startDate"),
    endDate: readString(value, "endDate"),
    travellers:
      readNumber(value, "travellers") ?? readNumber(value, "travelers"),
    budget: readNumber(value, "budget"),
    preferences: readStringArray(value, "preferences"),
    constraints: readStringArray(value, "constraints"),
    status: readString(value, "status"),
    itinerary: isRecord(value.itinerary)
      ? (value.itinerary as unknown as Trip["itinerary"])
      : undefined,
  }
}

export function adaptTripList(value: unknown): Trip[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error("The trips response was not a list.")
  return value.map(adaptTripResponse).filter((trip): trip is Trip => trip !== null)
}
