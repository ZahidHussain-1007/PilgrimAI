import type { ReactNode } from "react"
export function ItineraryCard({ children, title }: { children: ReactNode; title?: string }) {
  return <section className="rounded-2xl border border-[#e9e2d6] bg-[#fffefa] p-5 sm:p-7">{title && <h2 className="font-serif text-xl font-medium text-[#28271f]">{title}</h2>}<div className={title ? "mt-5" : ""}>{children}</div></section>
}
