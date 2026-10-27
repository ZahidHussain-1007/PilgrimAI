"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../../hooks/useAuth"
import { authService } from "../../services/auth/auth.service"

export function LoginPage() {
  const { status, loginWithGoogle } = useAuth()
  const router = useRouter()
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "authenticated") router.replace("/chat")
  }, [status, router])

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get("error")
    if (oauthError === "configuration") setError("Google sign-in is not configured yet. Please contact the app administrator.")
    else if (oauthError) setError("Google sign-in was not completed. Please try again.")
  }, [])

  if (status === "checking") return <main className="flex min-h-screen items-center justify-center text-sm text-[#827965]" role="status">Checking your session…</main>

  const message = error || (status === "error" ? "Sign-in is temporarily unavailable. Please try again." : "")

  async function continueWithGoogle() {
    setError("")
    setRedirecting(true)
    try {
      if (!await authService.isConfigured()) {
        setError("Google sign-in is not configured yet. Please contact the app administrator.")
        setRedirecting(false)
        return
      }
      await loginWithGoogle()
    } catch (reason) {
      setRedirecting(false)
      setError(reason instanceof Error ? reason.message : "Unable to sign in. Please try again.")
    }
  }

  return (
    <main className="login-page">
      <div className="login-art"><div className="art-glow"/><div className="art-copy"><span className="art-kicker">A JOURNEY INWARD</span><h1>Find your way<br/>to what matters.</h1><p>Make space for meaningful journeys.<br/>The details can come together here.</p><div className="art-sun" aria-hidden="true">ॐ</div></div><div className="art-foot">PILGRIMAI <span>·</span> TRAVEL WITH INTENTION</div></div>
      <section className="login-form-wrap"><div className="login-brand"><span className="brand-mark">ॐ</span><span>PilgrimAI</span></div><div className="login-card"><div className="eyebrow">WELCOME</div><h2>Your next chapter<br/>starts here.</h2><p>Sign in to continue planning meaningful journeys.</p>
        {message && <div className="notice error-notice" role="alert">{message}</div>}
        <button className="google-button" onClick={() => void continueWithGoogle()} disabled={redirecting}><span className="google-g" aria-hidden="true">G</span>{redirecting ? "Connecting to Google…" : "Continue with Google"}<span className="button-arrow" aria-hidden="true">→</span></button>
        <div className="login-divider"><span/><small>MADE FOR MEANINGFUL TRAVEL</small><span/></div><div className="login-note"><span aria-hidden="true">✧</span> Your account is secured by our authentication service</div>
      </div><footer className="login-footer">Secure sign-in with Google.</footer></section>
    </main>
  )
}
