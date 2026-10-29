import { describe, expect, it } from "vitest"
import {
  bcp47,
  detectSpeechLang,
  dictationSupported,
  speak,
  stopSpeaking,
  ttsSupported,
} from "../../src/lib/speech"

describe("detectSpeechLang", () => {
  it("detects Telugu script", () => {
    expect(detectSpeechLang("యాదాద్రి ఆలయం ఎలా వెళ్ళాలి?")).toBe("te")
  })

  it("detects Hindi (Devanagari) script", () => {
    expect(detectSpeechLang("यादाद्री मंदिर कैसे पहुँचें?")).toBe("hi")
  })

  it("defaults to English for latin text", () => {
    expect(detectSpeechLang("How do I reach the temple?")).toBe("en")
  })

  it("keeps Telugu when the sentence also has latin words", () => {
    expect(detectSpeechLang("Yadadri ఆలయం close by")).toBe("te")
  })

  it("keeps Hindi when Devanagari outnumbers Telugu", () => {
    expect(detectSpeechLang("नमस्ते यादाद्री मंदिर నమస్కారం")).toBe("hi")
  })

  it("treats empty text as English", () => {
    expect(detectSpeechLang("")).toBe("en")
  })
})

describe("bcp47", () => {
  it("maps supported languages to India-region tags", () => {
    expect(bcp47("hi")).toBe("hi-IN")
    expect(bcp47("te")).toBe("te-IN")
    expect(bcp47("en")).toBe("en-IN")
  })
})

describe("browser guards (node environment)", () => {
  it("reports no speech APIs under Node", () => {
    expect(dictationSupported()).toBe(false)
    expect(ttsSupported()).toBe(false)
  })

  it("speak() is a safe no-op without TTS", () => {
    expect(speak("hello")).toBe(false)
    expect(() => stopSpeaking()).not.toThrow()
  })
})
