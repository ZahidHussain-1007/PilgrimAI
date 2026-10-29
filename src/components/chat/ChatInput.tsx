import { useEffect, useRef, useState } from "react"
import {
  bcp47,
  dictationSupported,
} from "../../lib/speech"
import { useDictation } from "../../hooks/useDictation"

const VOICE_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Voice: Auto" },
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "हिन्दी" },
  { value: "te-IN", label: "తెలుగు" },
]

function resolveDictationLang(choice: string): string {
  if (choice !== "auto") return choice
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language
  }
  return bcp47("en")
}

export function ChatInput({ value, onChange, disabled, onSend }: { value: string; onChange: (value: string) => void; disabled?: boolean; onSend: (text: string) => void }) {
  const [voiceLang, setVoiceLang] = useState("auto")
  const valueRef = useRef(value)
  valueRef.current = value

  const { listening, start, stop } = useDictation((text) => {
    const current = valueRef.current.trimEnd()
    onChange(current ? `${current} ${text}` : text)
  })

  const canDictate = dictationSupported() && !disabled
  useEffect(() => () => stop(), [stop])

  function submit() { if (!value.trim() || disabled) return; onSend(value.trim()); onChange("") }
  return <div className="composer-wrap"><div className="composer"><button type="button" className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e9e2d6] text-sm transition-colors hover:border-[#d9c9ae] hover:bg-[#f6efe3] disabled:opacity-40" aria-label={listening ? "Stop dictation" : "Dictate message"} title={listening ? "Stop dictation" : "Speak your message"} disabled={!canDictate} onClick={() => (listening ? stop() : start(resolveDictationLang(voiceLang)))}>{listening ? "⏹" : "🎤"}</button><textarea value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder={listening ? "Listening…" : "Share what’s on your mind…"} rows={1} aria-label="Message PilgrimAI"/><button className="send-button" disabled={!value.trim() || disabled} onClick={submit} aria-label="Send message">↑</button></div><div className="composer-caption"><span>Thoughtful journeys begin with a question.</span><span className="flex items-center gap-3"><select aria-label="Dictation language" className="rounded-full border border-[#e9e2d6] bg-transparent px-2 py-1 text-xs text-[#79440f]" value={voiceLang} onChange={(event) => setVoiceLang(event.target.value)}>{VOICE_LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span>↵ Send <kbd>⇧ ↵</kbd> New line</span></span></div></div>
}
