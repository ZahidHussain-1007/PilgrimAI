/**
 * Multilingual voice helpers (keyless, browser-native Web Speech API).
 * - Dictation (speech -> text) uses SpeechRecognition / webkitSpeechRecognition
 * - Read-aloud (text -> speech) uses speechSynthesis
 * All guards are safe on the server (typeof window checks) so unit tests
 * can import this module in a Node environment.
 */

export type SpeechLang = "hi" | "te" | "en"

const BCP47: Record<SpeechLang, string> = {
  hi: "hi-IN",
  te: "te-IN",
  en: "en-IN",
}

/** Map a supported language to its BCP-47 tag for the Web Speech API. */
export function bcp47(lang: SpeechLang): string {
  return BCP47[lang] ?? BCP47.en
}

/**
 * Detect the main written language of a reply from its script:
 * Devanagari -> Hindi, Telugu -> Telugu, otherwise English.
 * Counts script characters only (latin words inside Telugu text do not
 * flip the result because the Telugu comparison wins over latin).
 */
export function detectSpeechLang(text: string): SpeechLang {
  let devanagari = 0
  let telugu = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x0900 && code <= 0x097f) devanagari += 1
    else if (code >= 0x0c00 && code <= 0x0c7f) telugu += 1
  }
  if (telugu === 0 && devanagari === 0) return "en"
  return telugu >= devanagari ? "te" : "hi"
}

export interface DictationResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

export interface DictationLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: DictationResultEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export type DictationCtor = new () => DictationLike

type WindowWithSpeech = {
  SpeechRecognition?: DictationCtor
  webkitSpeechRecognition?: DictationCtor
  speechSynthesis?: SpeechSynthesis
}

function speechWindow(): WindowWithSpeech | undefined {
  if (typeof window === "undefined") return undefined
  return window as unknown as WindowWithSpeech
}

/** Recognition constructor (Chrome/Edge); null elsewhere. */
export function dictationCtor(): DictationCtor | null {
  const w = speechWindow()
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null
}

export function dictationSupported(): boolean {
  return dictationCtor() !== null
}

export function ttsSupported(): boolean {
  return typeof speechWindow()?.speechSynthesis === "object"
}

/** Cancel any speech currently playing. */
export function stopSpeaking(): void {
  speechWindow()?.speechSynthesis?.cancel()
}

/**
 * Read text aloud in its detected (or given) language.
 * Returns false when the browser has no TTS (or on the server).
 */
export function speak(
  text: string,
  lang?: SpeechLang,
  onEnd?: () => void,
): boolean {
  const synth = speechWindow()?.speechSynthesis
  if (!synth || !text.trim()) return false
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = bcp47(lang ?? detectSpeechLang(text))
  if (onEnd) {
    utterance.onend = () => onEnd()
    utterance.onerror = () => onEnd()
  }
  synth.speak(utterance)
  return true
}
