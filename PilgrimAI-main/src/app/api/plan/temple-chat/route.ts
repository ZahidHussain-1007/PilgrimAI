import { NextResponse } from "next/server"
import { success } from "@/lib/api/response"

const BACKEND =
  process.env.MULTIAGENT_API_URL || "http://127.0.0.1:8000"
const UPSTREAM_TIMEOUT_MS = 25_000

/** Plan-page temple-suggestion chat → multiagent POST /temple-suggest.
 *  Browser never talks to the backend directly; this route mirrors
 *  /api/chat's proxy pattern with a tighter scope and timeout. */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const message = typeof body.message === "string" ? body.message.trim() : ""
  if (!message || message.length > 800) {
    return NextResponse.json(
      { error: "Message must be1–800 characters." },
      { status: 400 },
    )
  }
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length <= 80
      ? body.sessionId
      : undefined
  const language =
    typeof body.language === "string" && ["en", "te", "hi"].includes(body.language)
      ? body.language
      : "en"

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const upstream = await fetch(`${BACKEND}/temple-suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId, language }),
      signal: controller.signal,
      cache: "no-store",
    })
    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.detail || "The temple guide is unavailable right now." },
        { status: 502 },
      )
    }
    return success({
      content: typeof data?.content === "string" ? data.content : "",
      suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
      sessionId: typeof data?.sessionId === "string" ? data.sessionId : sessionId,
    })
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError"
    return NextResponse.json(
      {
        error: aborted
          ? "The temple guide took too long to reply."
          : "Could not reach the temple guide. Is the backend running on port8000?",
      },
      { status: aborted ? 504 : 502 },
    )
  } finally {
    clearTimeout(timer)
  }
}
