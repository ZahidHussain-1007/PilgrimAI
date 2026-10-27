import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../../hooks/useAuth"
import { UserAvatar } from "../ui/UserAvatar"

export function UserMenu({ onNavigate }: { onNavigate: () => void }) {
  const { logout, user } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function signOut() {
    setPending(true)
    setError("")
    try {
      await logout()
      router.push("/login")
      onNavigate()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to log out. Try again.")
    } finally {
      setPending(false)
    }
  }

  return <div className="sidebar-bottom"><div className="sidebar-caption">YOUR SPACE</div><button className="nav-link profile-link" onClick={() => { router.push("/profile"); onNavigate() }} title={user?.email ?? "Profile"}><UserAvatar className="avatar" avatarUrl={user?.avatarUrl}/><span className="profile-label">{user?.name || user?.email || "Profile"}</span><span className="more" aria-hidden="true">···</span></button>{error && <p className="px-3 text-xs text-red-700" role="alert">{error}</p>}<button className="signout" onClick={() => void signOut()} disabled={pending}>{pending ? "Logging out…" : "Logout"}</button></div>
}
