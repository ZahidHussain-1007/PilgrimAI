"use client"

import Link from "next/link"
import { useFavourites } from "../../hooks/useFavourites"

export function FavouritesPage() {
  const favourites = useFavourites()
  return <section className="mx-auto w-full max-w-5xl px-5 pb-12 sm:px-8 lg:px-12">
    <header className="border-b border-[#e8e0d1] py-8 sm:py-11"><p className="text-[10px] font-bold tracking-[.16em] text-[#9a8769]">KEPT CLOSE</p><h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[#28271f] sm:text-4xl">Favourites</h1><p className="mt-2 text-sm text-[#827965]">Places you’ve chosen to save for a future journey.</p></header>
    {favourites.loading && <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-[#827965]" role="status"><span className="size-4 animate-spin rounded-full border-2 border-[#e4dac8] border-t-[#aa6418]"/>Loading favourites…</div>}
    {favourites.error && <div className="mt-7 rounded-2xl border border-[#eadfca] bg-[#fffefa] p-6" role="alert"><h2 className="font-serif text-xl text-[#28271f]">Favourites are unavailable</h2><p className="mt-2 text-sm text-[#827965]">{favourites.error.message}</p><button className="mt-4 min-h-10 rounded-lg border border-[#d9c9ae] px-3 text-sm font-semibold text-[#79440f]" onClick={favourites.retry}>Try again</button></div>}
    {!favourites.loading && !favourites.error && favourites.data?.length === 0 && <div className="mx-auto flex min-h-[340px] max-w-lg flex-col items-center justify-center py-12 text-center"><div className="grid size-14 place-items-center rounded-full bg-[#f6f0e5] text-2xl text-[#ae7a3d]" aria-hidden="true">♡</div><h2 className="mt-5 font-serif text-2xl text-[#28271f]">Nothing saved just yet</h2><p className="mt-2 text-sm leading-6 text-[#827965]">Save a temple, stay, restaurant, or place you’d like to remember.</p><Link href="/chat" className="mt-5 min-h-11 rounded-xl bg-[#aa6418] px-4 py-3 text-sm font-semibold text-white">Explore in Chat</Link></div>}
    {!favourites.loading && !favourites.error && Boolean(favourites.data?.length) && <ul className="mt-6 grid gap-3 sm:grid-cols-2">{favourites.data?.map((item) => <li key={item.id} className="flex min-h-24 items-center gap-4 rounded-2xl border border-[#e9e2d6] bg-[#fffefa] p-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f6efe3] text-lg text-[#a66b2a]" aria-hidden="true">♡</span><div className="min-w-0">{item.title && <h2 className="truncate font-medium text-[#28271f]">{item.title}</h2>}{item.type && <p className="mt-1 text-xs capitalize text-[#827965]">{item.type}</p>}</div></li>)}</ul>}
  </section>
}
