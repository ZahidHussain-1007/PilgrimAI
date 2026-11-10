"use client"
import { useEffect, useState } from "react"
import {
  LANGUAGE_OPTIONS,
  getStoredLanguage,
  setStoredLanguage,
  type AppLanguage,
} from "../../lib/prefs"
import { useT } from "../../lib/i18n"

/** v19 landing language chips: EN / తె / हि — sets the reply language the
 *  chat sends to the backend. */
export function LanguagePicker() {
  const { t } = useT()
  const [lang, setLang] = useState<AppLanguage>("en")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setLang(getStoredLanguage())
    setReady(true)
  }, [])

  return (
    <div
      className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5"
      role="group"
      aria-label={t("lang.label")}
    >
      {/* visible text label removed to match the reference (chips only) and
          to keep the243px sidebar from wrapping; the group keeps aria-label */}
      <span className="sr-only">
        {t("lang.label")}
      </span>
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          key={option.code}
          type="button"
          disabled={!ready}
          aria-pressed={lang === option.code}
          className={`rounded-full border px-3 py-1 text-sm transition ${
            lang === option.code
              ? "border-[#aa6418] bg-[#aa6418] text-white"
              : "border-[#d9c9ae] bg-white text-[#79440f] hover:bg-[#f6efe3]"
          }`}
          onClick={() => {
            setStoredLanguage(option.code)
            setLang(option.code)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
