import { describe, expect, it } from "vitest"
import { evidenceLabel } from "../../src/services/ai/ai.service"

describe("evidenceLabel", () => {
  it("prefers the entity name when present", () => {
    expect(
      evidenceLabel({ name: "  Sri Sanghi Temple ", source: "osm_search" }),
    ).toBe("Sri Sanghi Temple")
  })

  it("maps internal jargon sources to human labels", () => {
    expect(evidenceLabel({ source: "osm_search" })).toBe("OpenStreetMap")
    expect(evidenceLabel({ source: "osrm" })).toBe("OSRM route")
    expect(evidenceLabel({ source: "route_chain" })).toBe("Route calculation")
    expect(evidenceLabel({ source: "calculation" })).toBe("Travel calculation")
    expect(evidenceLabel({ source: "temple_rag" })).toBe("Temple dataset")
    expect(evidenceLabel({ source: "entity_registry" })).toBe("Place registry")
    expect(evidenceLabel({ source: "nominatim" })).toBe("OpenStreetMap search")
  })

  it("humanizes unknown identifiers instead of leaking snake_case", () => {
    expect(evidenceLabel({ source: "server_side" })).toBe("Server side")
    expect(evidenceLabel({ source: "my_custom_source" })).toBe(
      "My custom source",
    )
  })

  it("falls back to kind, then generic", () => {
    expect(evidenceLabel({ kind: "note" })).toBe("Source (note)")
    expect(evidenceLabel({})).toBe("Source")
  })

  it("uses provider/role when source is absent", () => {
    expect(evidenceLabel({ provider: "osrm" })).toBe("OSRM route")
    expect(evidenceLabel({ role: "near", name: "Yadadri" })).toBe("Yadadri")
  })

  it("caps labels at 100 characters", () => {
    const long = "x".repeat(150)
    expect(evidenceLabel({ name: long })).toHaveLength(100)
  })
})
