import { describe, expect, it } from "vitest"
import {
  validateCreateTripInput,
  validateUpdateTripInput,
  validateCreateItineraryInput,
  validateCreateMessageInput,
  validateCreateFavouriteInput,
} from "../../src/lib/validation"
import { BadRequestError } from "../../src/lib/api/errors"

describe("Validation Unit Tests", () => {
  describe("validateCreateTripInput", () => {
    it("should accept valid trip input", () => {
      const input = {
        title: "Yadadri Pilgrimage",
        origin: "Hyderabad",
        destinations: ["Yadagirigutta"],
        startDate: "2026-11-01",
        endDate: "2026-11-02",
        travellers: 2,
        budget: 5000,
        preferences: ["Morning Darshan"],
      }

      const result = validateCreateTripInput(input)
      expect(result.title).toBe("Yadadri Pilgrimage")
      expect(result.origin).toBe("Hyderabad")
      expect(result.travellers).toBe(2)
      expect(result.preferences).toEqual(["Morning Darshan"])
      expect(result.status).toBe("planning")
    })

    it("should default preferences to empty array when omitted or null", () => {
      const resultWithoutPrefs = validateCreateTripInput({
        title: "Yadadri Pilgrimage",
      })
      expect(resultWithoutPrefs.preferences).toEqual([])

      const resultWithNullPrefs = validateCreateTripInput({
        title: "Yadadri Pilgrimage",
        preferences: null,
      })
      expect(resultWithNullPrefs.preferences).toEqual([])
    })

    it("should preserve explicitly supplied preferences", () => {
      const result = validateCreateTripInput({
        title: "Yadadri Pilgrimage",
        preferences: ["Suprabhata Seva", "Senior-citizen friendly"],
      })
      expect(result.preferences).toEqual(["Suprabhata Seva", "Senior-citizen friendly"])
    })

    it("should reject missing or empty title", () => {
      expect(() => validateCreateTripInput({ title: "" })).toThrow(
        BadRequestError,
      )
      expect(() => validateCreateTripInput({})).toThrow(BadRequestError)
    })
  })

  describe("validateUpdateTripInput", () => {
    it("should accept partial updates", () => {
      const result = validateUpdateTripInput({ budget: 8000 })
      expect(result.budget).toBe(8000)
      expect(result.title).toBeUndefined()
    })
  })

  describe("validateCreateItineraryInput", () => {
    it("should accept valid itinerary input", () => {
      const result = validateCreateItineraryInput({
        title: "Day 1 Darshan and Sevas",
        estimatedCost: 1500,
      })
      expect(result.title).toBe("Day 1 Darshan and Sevas")
      expect(result.estimatedCost).toBe(1500)
      expect(result.currency).toBe("INR")
    })
  })

  describe("validateCreateMessageInput", () => {
    it("should accept valid message content", () => {
      const result = validateCreateMessageInput({
        message: "What are the darshan timings at Yadadri?",
      })
      expect(result.content).toBe("What are the darshan timings at Yadadri?")
      expect(result.language).toBe("en")
    })

    it("should reject empty message content", () => {
      expect(() => validateCreateMessageInput({ content: "" })).toThrow(
        BadRequestError,
      )
    })
  })

  describe("validateCreateFavouriteInput", () => {
    it("should accept valid favourite input", () => {
      const result = validateCreateFavouriteInput({
        title: "Yadadri Lakshmi Narasimha Swamy",
        type: "temple",
      })
      expect(result.title).toBe("Yadadri Lakshmi Narasimha Swamy")
      expect(result.type).toBe("temple")
    })
  })
})
