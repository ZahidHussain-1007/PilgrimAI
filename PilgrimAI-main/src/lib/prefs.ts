/** v19: tiny local prefs shared by landing + chat. */
const LANG_KEY = "pilgrim:language"

export type AppLanguage = "en" | "te" | "hi"

export const LANGUAGE_OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "te", label: "\u0c24\u0c46" },
  { code: "hi", label: "\u0939\u093f" },
]

export function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "en"
  const value = window.localStorage.getItem(LANG_KEY)
  return value === "te" || value === "hi" ? value : "en"
}

export function setStoredLanguage(lang: AppLanguage): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LANG_KEY, lang)
  // v19.1: live translation — every mounted t() consumer re-renders.
  window.dispatchEvent(new Event("pilgrim:language-changed"))
}
