export type PriceAllowance = { low: number; high: number };
export type PlanningRequest = {
  primary_temple_id?: string;
  timezone?: "Asia/Kolkata";
  stay_mode?: "daily_return" | "overnight";
  allow_unconfirmed_stay?: boolean;
  time_grid_minutes?: 1 | 5;
  hotel_id?: string | null;
  avoid_climbing?: boolean;
  daily_travel_limit_minutes?: number | null;
  traffic_buffer_percent?: number;
  parking_buffer_minutes?: number;
  meal_minutes?: number;
  meal_price_per_person?: PriceAllowance | null;
  tolls_per_day?: PriceAllowance | null;
  parking_per_visit?: PriceAllowance | null;
  miscellaneous_per_day?: PriceAllowance | null;
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
  verification?: string;
  venue?: string;
  meal?: string;
  from_id?: string;
  to_id?: string;
  location_id?: string;
  leg_complete?: boolean;
  estimated?: boolean;
  url?: string;
};
export type PlanTemple = {
  id: string;
  name: string;
  url: string;
  hours_basis?: string;
  lat?: number;
  lng?: number;
  last_verified?: string;
  windows?: Record<string, number[][]>;
  verification?: string;
  source?: string;
  facts: Record<string, unknown>;
  nearby: { name: string; url: string; scheduled: boolean }[];
};
export type RoutePoint = { id: string; name: string; lat: number; lng: number };
export type CostLine = {
  category: string;
  date: string;
  quantity: number;
  unit: string;
  status: string;
  unit_low: number | null;
  unit_high: number | null;
  low: number | null;
  high: number | null;
  source: string | null;
  basis: string;
  place_id?: string | null;
};
export type PlanDay = {
  date: string;
  items: PlanItem[];
  coverage?: string;
  incomplete_reason?: string;
  route_points?: RoutePoint[];
  maps_url?: string | null;
  overnight?: {
    hotel_id: string | null;
    next_date: string;
    rooms: number;
    people: number;
    availability: string;
  };
};
export type PlanResult = {
  schema_version?: number;
  destinations?: PlanTemple[];
  attractions?: {
    id: string | null;
    name: string;
    url: string;
    classification: string;
    reason: string;
    reason_codes?: string[];
    distance_from_primary_km?: number;
    visit_minutes?: number;
  }[];
  selection_rationale?: {
    primary_temple_id: string;
    required_ids: string[];
    scheduled_ids: string[];
  };
  alternatives?: {
    action: string;
    suggested_days?: number;
    reason: string;
    checked_feasible?: boolean;
    checked_days?: PlanDay[];
    changes?: Record<string, unknown>;
  }[];
  validation?: {
    passed: boolean;
    critical: { code: string; details: string[] }[];
    warnings: { code: string; details: string[] }[];
  };
  date_contract?: {
    requested_dates: string[];
    start_date: string;
    end_date: string;
    timezone: string;
  };
  title: string;
  days: PlanDay[];
  feasible: boolean;
  conflicts: { code: string; details: string[] }[];
  budget: {
    low: number;
    high: number;
    complete: boolean;
    cap?: number | null;
    total_type?: string;
    known_subtotal?: number;
    estimated_subtotal?: { low: number; high: number };
    per_person?: { low: number; high: number; travellers: number };
    categories?: {
      category: string;
      low: number;
      high: number;
      status: string;
    }[];
    daywise?: { date: string; low: number; high: number; unknown: string[] }[];
    items?: CostLine[];
    confidence?: string;
    assumptions?: string[];
    within_cap: boolean | null;
    distance_km?: number;
    components?: { name: string; low: number; high: number; basis: string }[];
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
    overnight_area?: Record<string, unknown>;
    selected_hotel?: Record<string, unknown> | null;
    notes?: string[];
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
  error_code?: string;
  origin_candidates?: {
    display_name: string;
    latitude: number;
    longitude: number;
  }[];
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
/** Calendar dates are identities, not instants in the viewer's timezone. */
export function formatPlanningDate(
  value: string,
  language: "en" | "te" | "hi" = "en",
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Invalid calendar date");
  const parsed = new Date(value + "T12:00:00Z");
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid calendar date");
  return new Intl.DateTimeFormat(language + "-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed);
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
    "X-WR-TIMEZONE:Asia/Kolkata",
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
