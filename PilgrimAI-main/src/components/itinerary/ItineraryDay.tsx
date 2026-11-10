import type { ReactNode } from "react"
export function ItineraryDay({ label, children }: { label?: string; children?: ReactNode }) {
  return <section className="relative border-l border-[#dfcfb3] pb-7 pl-5 last:border-transparent last:pb-0"><span className="absolute -left-[5px] top-1 size-[9px] rounded-full bg-[#aa6418]"/>{label && <h3 className="font-serif text-lg font-medium text-[#28271f]">{label}</h3>}{children && <div className="mt-3 grid gap-3">{children}</div>}</section>
}
