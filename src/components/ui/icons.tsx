import type { SVGProps } from "react"

/** v19.6: orange line-art icon set (reference style — no emoji). */
type P = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  }
}

export function TempleIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 2.5c.9 0 1.6.7 1.6 1.6v1.3h-3.2V4.1c0-.9.7-1.6 1.6-1.6z" />
      <path d="M7.5 8.5 12 5.4l4.5 3.1" />
      <path d="M6 21V9.8h12V21" />
      <path d="M9.4 21v-5.4a2.6 2.6 0 0 1 5.2 0V21" />
      <path d="M3 21h18" />
      <path d="M8.8 12.4h.01M15.2 12.4h.01" />
    </svg>
  )
}

export function CalendarIcon(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.6h17M8 2.8V6M16 2.8V6" />
      <path d="M7.6 13.2h2.2M11 16.4h2.2M14.2 13.2h2.2" />
    </svg>
  )
}

export function RouteIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="5.5" cy="18.5" r="2.2" />
      <circle cx="18.5" cy="5.5" r="2.2" />
      <path d="M7.7 18.5h4.1a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h6" strokeDasharray="0.1 3.4" />
      <path d="M14.4 4.2 18.5 5.5l-2.9 2.6" />
    </svg>
  )
}

export function PinIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21z" />
      <circle cx="12" cy="10.4" r="2.4" />
    </svg>
  )
}

export function ClockIcon(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3.1 2" />
    </svg>
  )
}

export function BoltIcon(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M13.2 2.8 5.6 13.4h5.1l-1 7.8 7.7-10.7h-5.2l1-7.7z" />
    </svg>
  )
}
