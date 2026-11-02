export type PlanningRequest = {
  temple_ids: string[];
  origin: string;
  start_date: string;
  days: number;
  departure: string;
  finish: string;
  adults: number;
  children: number;
  elderly: number;
  transport: "car" | "taxi" | "bus" | "train";
  stay: "none" | "hotel" | "guest" | "dham";
  food: "veg" | "nonveg" | "jain" | "any";
  special: "none" | "wheel" | "elder" | "medical";
  budget_tier: "low" | "mid" | "high";
  budget_cap: number | null;
  rooms: number;
  visit_minutes: number;
  rest_minutes: number;
  priorities: string[];
  include_attractions: boolean;
  language: "en" | "te" | "hi";
  allow_estimates: boolean;
};
export type PlanItem = {
  type: string;
  title: string;
  start: string;
  end: string;
  duration_minutes: number;
  place_id?: string;
  distance_km?: number;
  source?: string;
  estimated?: boolean;
  url?: string;
};
export type PlanTemple = {
  id: string;
  name: string;
  url: string;
  hours_basis?: string;
  facts: Record<string, unknown>;
  nearby: { name: string; url: string; scheduled: boolean }[];
};
export type PlanResult = {
  title: string;
  days: { date: string; items: PlanItem[] }[];
  feasible: boolean;
  conflicts: { code: string; details: string[] }[];
  budget: {
    low: number;
    high: number;
    complete: boolean;
    cap: number | null;
    within_cap: boolean | null;
    distance_km: number;
    components: { name: string; low: number; high: number; basis: string }[];
    missing: string[];
  };
  request: PlanningRequest;
  temples: PlanTemple[];
  routes: Record<
    string,
    {
      from: string;
      to: string;
      km: number | null;
      minutes: number | null;
      url: string;
      source: string;
      estimated: boolean;
    }
  >;
  warnings: string[];
  options: {
    hotels: Record<string, unknown>[];
    restaurants: Record<string, unknown>[];
  };
  agent_trace: { agent: string; mode: string }[];
  algorithm: string;
  elapsed_seconds: number;
};
export type PlanningJob = {
  id: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "needs_changes"
    | "failed"
    | "cancelled";
  stage: string;
  created_at: string;
  version: number;
  title: string;
  request: PlanningRequest;
  result: PlanResult | null;
  error?: string;
  parent?: string;
  history?: { role: string; text: string; evidence?: unknown }[];
};
export async function planningFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch("/api/planning/" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || `Planning request failed (${response.status})`,
    );
  return data as T;
}
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function platformLinks(origin: string, destination: string) {
  return [
    { name: "redBus", url: "https://www.redbus.in/", kind: "bus" },
    { name: "AbhiBus", url: "https://www.abhibus.com/", kind: "bus" },
    {
      name: "IRCTC",
      url: "https://www.irctc.co.in/nget/train-search",
      kind: "train",
    },
    { name: "OYO", url: "https://www.oyorooms.com/", kind: "hotel" },
    {
      name: "Booking.com",
      url:
        "https://www.booking.com/searchresults.html?" +
        new URLSearchParams({ ss: destination }),
      kind: "hotel",
    },
    {
      name: "MakeMyTrip",
      url: "https://www.makemytrip.com/hotels/",
      kind: "hotel",
    },
    {
      name: "Google Maps",
      url:
        "https://www.google.com/maps/dir/?" +
        new URLSearchParams({ api: "1", origin, destination }),
      kind: "map",
    },
  ];
}
export function calendarText(job: PlanningJob) {
  const escape = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PilgrimAI//Validated planning draft//EN",
    "CALSCALE:GREGORIAN",
  ];
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z/, "Z");
  for (const day of job.result?.days || [])
    for (const [i, item] of day.items.entries()) {
      const time = (clock: string) => {
        const utc = new Date(`${day.date}T${clock}:00+05:30`);
        return utc
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z/, "Z");
      };
      rows.push(
        "BEGIN:VEVENT",
        `UID:${job.id}-${job.version}-${day.date}-${i}@pilgrimai`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${time(item.start)}`,
        `DTEND:${time(item.end)}`,
        `SUMMARY:${escape(item.title)}`,
        `DESCRIPTION:${escape("Planning draft, not a reservation. " + (item.source || "") + " " + (item.url || ""))}`,
        "END:VEVENT",
      );
    }
  rows.push("END:VCALENDAR");
  // RFC 5545: fold by UTF-8 octets, never split a multi-byte character.
  const fold = (line: string) => {
    const parts: string[] = [];
    let part = "",
      bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 75) {
        parts.push(part);
        part = " ";
        bytes = 1;
      }
      part += char;
      bytes += size;
    }
    parts.push(part);
    return parts.join("\r\n");
  };
  return rows.map(fold).join("\r\n") + "\r\n";
}
