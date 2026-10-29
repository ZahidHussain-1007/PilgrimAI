"use client"

import { useCallback, useRef, useState } from "react"
import {
  dictationCtor,
  type DictationLike,
} from "../lib/speech"

/**
 * Push-to-talk dictation: start(lang) records one utterance, hands the
 * transcript to onText, then stops. Safe in every browser: when the
 * Web Speech API is missing, start() is a no-op (button renders disabled).
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<DictationLike | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const stop = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(
    (lang: string) => {
      const Ctor = dictationCtor()
      if (!Ctor) return
      if (recRef.current) {
        stop()
        return
      }
      const rec = new Ctor()
      rec.lang = lang
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim()
        if (transcript) onTextRef.current(transcript)
      }
      rec.onerror = () => {
        recRef.current = null
        setListening(false)
      }
      rec.onend = () => {
        recRef.current = null
        setListening(false)
      }
      recRef.current = rec
      setListening(true)
      try {
        rec.start()
      } catch {
        recRef.current = null
        setListening(false)
      }
    },
    [stop],
  )

  return { listening, start, stop }
}
