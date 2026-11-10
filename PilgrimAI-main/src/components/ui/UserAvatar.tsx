export function UserAvatar({ className = "", avatarUrl }: { className?: string; avatarUrl?: string }) {
  return <span className={className} aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover"/> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.3 3.2-5 7-5s6.3 1.7 7 5" strokeLinecap="round"/></svg>}</span>
}
