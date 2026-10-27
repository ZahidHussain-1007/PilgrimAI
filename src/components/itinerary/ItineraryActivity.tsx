export function ItineraryActivity({ title, kind, time, description }: { title?: string; kind?: string; time?: string; description?: string }) {
  if (!title && !kind && !time && !description) return null
  return <article className="rounded-xl border border-[#eee8dc] bg-white p-4"><div className="flex flex-wrap items-baseline justify-between gap-2">{title && <h4 className="font-medium text-[#28271f]">{title}</h4>}{time && <p className="text-xs text-[#827965]">{time}</p>}</div>{kind && <p className="mt-1 text-xs capitalize text-[#9a8769]">{kind}</p>}{description && <p className="mt-2 text-sm leading-6 text-[#756d5e]">{description}</p>}</article>
}
