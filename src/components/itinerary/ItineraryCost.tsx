export function ItineraryCost({ amount, currency, label = "Estimated cost" }: { amount?: number; currency?: string; label?: string }) {
  if (amount == null) return null
  return <div className="flex items-center justify-between gap-4 border-t border-[#eee8dc] py-3 text-sm"><span className="text-[#756d5e]">{label}</span><span className="font-medium text-[#28271f]">{currency && `${currency} `}{amount.toLocaleString()}</span></div>
}
