import type { MultiAgentEvidenceItem } from "../services/ai/multiagent.client"

/**
 * v18 P0-4: derive 3 logical next-step questions from the TOP entity in the
 * evidence when the backend sent none (DEGRADED / older responses).
 * Sequence: detail about the place -> how to reach it -> fit/cost.
 * Pure function -> unit-testable; never invents places not in evidence.
 */
export function deriveFollowUps(
  evidence: MultiAgentEvidenceItem[] | undefined,
): string[] {
  let place: string | null = null

  for (const raw of evidence ?? []) {
    if (!raw || typeof raw !== "object") continue
    const item = raw as { kind?: string; name?: string; role?: string }
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (!name) continue

    if (item.kind === "temple_candidate") {
      return [
        `What are the darshan timings and entry details for ${name}?`,
        `How do I reach ${name} from my starting point?`,
        `Is ${name} a good fit for elderly visitors and children?`,
      ]
    }
    const isPlace =
      item.kind === "poi" ||
      (item.kind === "place" && item.role !== "origin")
    if (isPlace && !place) place = name
  }

  if (place) {
    return [
      `What can I see at ${place}?`,
      `How do I reach ${place}?`,
      `What is the best time to visit ${place}?`,
    ]
  }
  return []
}
