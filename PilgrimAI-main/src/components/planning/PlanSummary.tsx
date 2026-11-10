"use client";
import { useT } from "../../lib/i18n";
import { planningT } from "../../lib/planningCopy";
import {
  safeUrl,
  type PlanningJob,
  type PlanDay,
  type RoutePoint,
} from "../../lib/planning";
const box = "rounded-2xl border border-[#e8d9c2] bg-[#fffdf9] p-5";
const cash = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export function PlanOverview({
  job,
  onAlternative,
}: {
  job: PlanningJob;
  onAlternative?: (changes: Record<string, unknown>) => void;
}) {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const r = job.result!;
  const primary = r.temples.find(
    (t) =>
      t.id === (job.request.primary_temple_id || job.request.temple_ids[0]),
  );
  return (
    <section className={box} data-plan-overview>
      <h2 className="font-serif text-xl">{p("overview")}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [p("primary"), primary?.name],
          [
            p("plannedDays"),
            `${r.days.filter((d) => d.items.some((i) => i.type === "visit")).length} / ${job.request.days}`,
          ],
          [
            p("travellers"),
            String(
              job.request.adults + job.request.children + job.request.elderly,
            ),
          ],
          [p("stay_mode"), p(job.request.stay_mode || "daily_return")],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-[#796b5d]">{label}</dt>
            <dd className="mt-1 text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-5 font-semibold">{p("rationale")}</h3>
      <p className="mt-2 text-sm leading-6 text-[#796b5d]">
        {p("rationaleBody")}
      </p>
      {!!r.alternatives?.length && (
        <div className="mt-4 rounded-xl bg-[#faf0df] p-4">
          <h3 className="font-semibold">{p("nextSteps")}</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
            {r.alternatives.map((a, i) => (
              <li key={i}>{p(a.action)}</li>
            ))}
          </ul>
        </div>
      )}
      {r.alternatives
        ?.filter((a) => a.checked_days)
        .map((a, index) => (
          <details
            className="mt-4 rounded-xl border border-[#e8d9c2] p-4"
            key={index}
          >
            <summary className="cursor-pointer font-semibold">
              {p("longerAlternative")} · {a.suggested_days} {p("days")}
            </summary>
            <p className="mt-3 text-sm">
              {a.checked_feasible ? p("draft") : p("alternativeIncomplete")}
            </p>
            {a.checked_days?.map((d) => (
              <div key={d.date} className="mt-3 text-sm">
                <time className="font-semibold">{d.date}</time>
                {d.items
                  .filter((i) => i.type === "visit")
                  .map((i, n) => (
                    <p className="mt-1" key={n}>
                      {i.start}–{i.end} · {i.title}
                    </p>
                  ))}
              </div>
            ))}
            {a.checked_feasible && a.changes && onAlternative && (
              <button
                className="mt-3 rounded-full border border-[#d7b98d] px-4 py-2 text-sm text-[#82501c]"
                onClick={() => onAlternative(a.changes!)}
              >
                {p("reviewAlternative")}
              </button>
            )}
          </details>
        ))}
    </section>
  );
}
export function DailyRoute({ day }: { day: PlanDay }) {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const pts = day.route_points || [];
  if (pts.length < 2) return null;
  const minX = Math.min(...pts.map((n) => n.lng)),
    maxX = Math.max(...pts.map((n) => n.lng)),
    minY = Math.min(...pts.map((n) => n.lat)),
    maxY = Math.max(...pts.map((n) => n.lat));
  const xy = (n: RoutePoint) => [
    45 + (510 * (n.lng - minX)) / (maxX - minX || 1),
    225 - (175 * (n.lat - minY)) / (maxY - minY || 1),
  ];
  const unique = pts.filter(
    (n, i) => pts.findIndex((t) => t.id === n.id) === i,
  );
  return (
    <section
      className="mt-5 rounded-2xl border border-[#e8d9c2] p-4"
      data-daily-route
    >
      <h3 className="font-serif text-lg">{p("routeMap")}</h3>
      <p className="mt-1 text-xs leading-5 text-[#796b5d]">{p("schematic")}</p>
      <div className="mt-3 grid items-center gap-4 md:grid-cols-2">
        <svg
          viewBox="0 0 600 270"
          role="img"
          aria-label={p("routeMap")}
          className="w-full rounded-xl bg-[#f8f0e1]"
        >
          <defs>
            <pattern
              id="route-grid"
              width="30"
              height="30"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M30 0H0V30"
                fill="none"
                stroke="#e8d9c2"
                strokeWidth=".5"
              />
            </pattern>
          </defs>
          <rect width="600" height="270" fill="url(#route-grid)" />
          <polyline
            points={pts.map((n) => xy(n).join(",")).join(" ")}
            fill="none"
            stroke="#b77529"
            strokeWidth="3"
            strokeDasharray="7 4"
          />
          {unique.map((n) => {
            const [x, y] = xy(n);
            const numbers = pts
              .flatMap((t, i) => (t.id === n.id ? [i + 1] : []))
              .join("/");
            return (
              <g key={n.id}>
                <title>{numbers + " " + n.name}</title>
                <circle cx={x} cy={y} r="17" fill="#a6621d" />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize="11"
                  fontWeight="bold"
                >
                  {numbers}
                </text>
              </g>
            );
          })}
        </svg>
        <ol className="space-y-2 text-sm">
          {pts.map((n, i) => (
            <li key={i} className="flex gap-3">
              <strong className="text-[#a6621d]">{i + 1}.</strong>
              <span>{n.name}</span>
            </li>
          ))}
        </ol>
      </div>
      {safeUrl(day.maps_url) && (
        <a
          className="mt-3 inline-block text-sm font-semibold text-[#9c5e19] underline"
          href={safeUrl(day.maps_url)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {p("navigation")} ↗
        </a>
      )}
    </section>
  );
}
export function BudgetSummary({ job }: { job: PlanningJob }) {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const b = job.result!.budget;
  const priced = b.items
    ? b.items.some((e) => e.quantity > 0 && e.low !== null)
    : true;
  return (
    <section className={box} data-plan-budget>
      <h2 className="font-serif text-xl">{p("budgetTitle")}</h2>
      <p className="mt-3 text-sm text-[#796b5d]">
        {p(
          b.total_type ||
            (!b.complete ? "partial_subtotal" : "planning_estimate"),
        )}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[#9c5e19]">
        {priced ? `${cash(b.low)}–${cash(b.high)}` : p("unknownCost")}
      </p>
      {b.known_subtotal !== undefined && (
        <p className="mt-3 text-xs text-[#796b5d]">
          {p("catalogSubtotal")}: {cash(b.known_subtotal)}
        </p>
      )}
      {b.estimated_subtotal && (
        <p className="mt-1 text-xs text-[#796b5d]">
          {p("estimatedSubtotal")}: {cash(b.estimated_subtotal.low)}–
          {cash(b.estimated_subtotal.high)}
        </p>
      )}
      {b.per_person && (
        <p className="mt-2 text-sm">
          {p("perPerson")}:{" "}
          {priced
            ? `${cash(b.per_person.low)}–${cash(b.per_person.high)}`
            : p("unknownCost")}
        </p>
      )}
      <p className="mt-2 text-xs">
        {p("confidence")}: {p(b.confidence || "low")}
      </p>
      {!b.complete && (
        <p className="mt-3 rounded-xl bg-[#faf0df] p-3 text-sm leading-6">
          {p("subtotalNotice")}
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          b.categories ||
          b.components?.map((c) => ({
            category: c.name,
            low: c.low,
            high: c.high,
            status: "estimated",
          })) ||
          []
        ).map((c) => (
          <div key={c.category} className="rounded-xl bg-[#faf5ec] p-3">
            <h3 className="text-sm font-semibold">{p(c.category)}</h3>
            <p className="mt-1 text-sm">
              {c.status === "unknown"
                ? p("unknownCost")
                : `${cash(c.low)}–${cash(c.high)}`}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#796b5d]">
              {p(c.status)}
            </p>
          </div>
        ))}
      </div>
      {!!b.daywise?.length && (
        <div className="mt-5">
          <h3 className="font-semibold">{p("daywise")}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {b.daywise.map((d) => (
              <div
                key={d.date}
                className="rounded-xl border border-[#e8d9c2] p-3 text-sm"
              >
                <time>{d.date}</time>
                <strong className="ml-3">
                  {cash(d.low)}–{cash(d.high)}
                </strong>
                {d.unknown.length > 0 && (
                  <p className="mt-2 text-xs text-[#796b5d]">
                    {p("missing")}: {d.unknown.map(p).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!!b.items?.length && (
        <details className="mt-4">
          <summary className="cursor-pointer font-semibold text-[#9c5e19]">
            {p("ledger")}
          </summary>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
            {b.items.map((e, i) => (
              <div key={i} className="rounded-xl bg-[#faf5ec] p-3 text-xs">
                <p className="font-semibold">
                  {e.date} · {p(e.category)} · {e.quantity} ×{" "}
                  {e.unit_low === null ? p("unknown") : cash(e.unit_low)}–
                  {e.unit_high === null ? p("unknown") : cash(e.unit_high)}
                </p>
                <p className="mt-1">{p(e.status)}</p>
                {e.source && (
                  <p className="mt-1 break-words text-[#796b5d]">
                    {p("source")}: {e.source}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {!!b.missing.length && (
        <p className="mt-4 text-sm">
          {p("missing")}: {b.missing.map(p).join(", ")}
        </p>
      )}
    </section>
  );
}
export function DiscoveryCards({ job }: { job: PlanningJob }) {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const result = job.result!;
  const groups = ["hotels", "restaurants"] as const;
  return (
    <section className={box} data-discoveries>
      <h2 className="font-serif text-xl">{p("options")}</h2>
      {result.options.notes?.map((note) => (
        <p key={note} className="mt-3 rounded-xl bg-[#faf0df] p-3 text-sm">
          {p(note)}
        </p>
      ))}
      {groups.map((key) => (
        <details
          key={key}
          className="mt-4"
          open={key === "hotels" && job.request.stay_mode === "overnight"}
        >
          <summary className="cursor-pointer font-serif text-lg">
            {p(key)} · {result.options[key].length}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {result.options[key].map((o, i) => (
              <article
                key={i}
                className="min-w-0 rounded-xl bg-[#faf5ec] p-4 text-sm"
              >
                <h3 className="font-semibold">{String(o.name || "")}</h3>
                <p className="mt-2 text-xs leading-5">
                  {p("address")}: {String(o.address || p("unknown"))}
                </p>
                <p className="mt-2">
                  {String(
                    o.price_range || o.average_cost_for_one || p("unknown"),
                  )}
                </p>
                {key === "hotels" ? (
                  <>
                    <p className="mt-2 text-xs">
                      {p("capacity")}:{" "}
                      {typeof o.capacity_per_room === "number"
                        ? o.capacity_per_room
                        : p("unknown")}{" "}
                      · {p("extraBed")}:{" "}
                      {o.extra_bed === true
                        ? p("confirmed")
                        : o.extra_bed === false
                          ? p("none")
                          : p("unknown")}
                    </p>
                    <p className="mt-2 text-xs">
                      {p(String(o.match_status || "capacity_unknown"))}
                    </p>
                    <p className="mt-2 text-xs">
                      {p("checkin")}: {String(o.check_in || p("unknown"))} ·{" "}
                      {p("checkout")}: {String(o.check_out || p("unknown"))}
                    </p>
                    <p className="mt-2 text-xs">
                      {p("availability")}:{" "}
                      {p(String(o.availability || "unverified"))} ·{" "}
                      {p(String(o.booking_status || "not_booked"))}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-xs">
                      {p(String(o.diet_evidence || "unverified"))} ·{" "}
                      {String(o.hours || p("unknown"))}
                    </p>
                    {o.lat === null && (
                      <p className="mt-2 text-xs leading-5 text-[#796b5d]">
                        {p("transferUnconfirmed")}
                      </p>
                    )}
                  </>
                )}
                <p className="mt-2 text-xs text-[#796b5d]">
                  {p("catalog_not_live")}
                </p>
                <p className="mt-1 text-xs">
                  {p("lastVerified")}:{" "}
                  {typeof o.last_verified === "string"
                    ? o.last_verified
                    : p("unknown")}
                </p>
                {key === "hotels" && (
                  <>
                    <p className="mt-2 text-xs">
                      {String(o.hotel_type || p("unknown"))}
                    </p>
                    <p className="mt-1 text-xs">
                      {p("travellers")}: {String(o.requested_people || "")} ·{" "}
                      {p("rooms")}: {String(o.requested_rooms || "")}
                    </p>
                    <p className="mt-1 text-xs">
                      {p("distanceToPrimary")}:{" "}
                      {typeof o.distance_to_primary_km === "number"
                        ? `${o.distance_to_primary_km} km · ${String(o.distance_source)}`
                        : p("unknown")}
                    </p>
                  </>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#9c5e19]">
                  {safeUrl(o.maps_url || o.map_link) && (
                    <a
                      href={safeUrl(o.maps_url || o.map_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Google Maps ↗
                    </a>
                  )}
                  {safeUrl(o.source_url) && (
                    <a
                      href={safeUrl(o.source_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {p("source")} ↗
                    </a>
                  )}
                  {o.booking_links && typeof o.booking_links === "object"
                    ? Object.entries(o.booking_links).map(([name, url]) =>
                        safeUrl(url) ? (
                          <a
                            key={name}
                            href={safeUrl(url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            {name} ↗
                          </a>
                        ) : null,
                      )
                    : null}
                </div>
              </article>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
export function AttractionSelection({ job }: { job: PlanningJob }) {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const list = job.result?.attractions || [];
  return (
    <section className={box} data-attractions>
      <h2 className="font-serif text-xl">{p("nearby")}</h2>
      {["scheduled", "optional", "excluded"].map((group) => (
        <div key={group} className="mt-4">
          <h3 className="font-semibold">
            {p(group)} · {list.filter((a) => a.classification === group).length}
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {list
              .filter((a) => a.classification === group)
              .map((a, i) => (
                <article
                  key={i}
                  className="rounded-xl bg-[#faf5ec] p-3 text-sm"
                >
                  <a
                    href={safeUrl(a.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#9c5e19] underline"
                  >
                    {a.name} ↗
                  </a>
                  <p className="mt-2 text-xs leading-5 text-[#796b5d]">
                    {p(a.reason)}
                  </p>
                  {!!a.reason_codes?.length && (
                    <ul className="mt-2 list-disc pl-4 text-xs text-[#796b5d]">
                      {a.reason_codes.map((code) => (
                        <li key={code}>
                          {p(code) === code ? p("validationIssue") : p(code)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.visit_minutes && (
                    <p className="mt-1 text-xs">{a.visit_minutes} min</p>
                  )}
                </article>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Readable temple facts, with the source text preserved rather than invented
 * availability or an LLM-generated operational summary. */
export function TempleInformation({ job }: { job: PlanningJob }) {
  const { lang } = useT();
  const p = (k: string) => planningT(lang, k);
  const result = job.result!;
  const selected = (result.destinations || result.temples).filter(
    (t) =>
      job.request.temple_ids.includes(t.id) ||
      result.days.some((d) => d.items.some((i) => i.place_id === t.id)),
  );
  const time = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (
    <section className={box} data-temple-information>
      <h2 className="font-serif text-xl">{p("details")}</h2>
      <p className="mt-2 text-xs text-[#796b5d]">
        {p("catalogSourceLanguage")}
      </p>
      {selected.map((tm) => {
        const facts = tm.facts || {};
        const tickets = facts.darshan_and_tickets;
        const general =
          tickets && typeof tickets === "object"
            ? (tickets as Record<string, unknown>).general_darshan
            : null;
        const sourceURLs = Array.isArray(facts.sources)
          ? facts.sources.flatMap((s) =>
              typeof s === "string" && s.match(/^https?:\/\/\S+/)?.[0]
                ? [s.match(/^https?:\/\/\S+/)![0]]
                : [],
            )
          : [];
        return (
          <article key={tm.id} className="mt-5 border-t border-[#e8d9c2] pt-4">
            <h3 className="font-serif text-xl">{tm.name}</h3>
            <p className="mt-1 text-xs text-[#796b5d]">
              {p("lastVerified")}:{" "}
              {tm.last_verified || String(facts.last_verified || p("unknown"))}{" "}
              · {p("catalog_not_live")}
            </p>
            {typeof facts.summary === "string" && (
              <p className="mt-3 text-sm leading-6">{facts.summary}</p>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold">
                  {p("publishedWindows")} · IST
                </h4>
                {tm.windows &&
                  Object.entries(tm.windows).map(([date, windows]) => (
                    <p
                      className="mt-2 text-xs leading-5 text-[#796b5d]"
                      key={date}
                    >
                      <time>{date}</time> ·{" "}
                      {windows.length
                        ? windows
                            .map((w) => `${time(w[0])}–${time(w[1])}`)
                            .join(", ")
                        : p("unknown")}
                    </p>
                  ))}
                <p className="mt-2 text-xs leading-5 text-[#796b5d]">
                  {tm.hours_basis}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-semibold">{p("admissionLabel")}</h4>
                <p className="mt-2 text-xs leading-5 text-[#796b5d]">
                  {typeof general === "string" ? general : p("unknown")}
                </p>
              </div>
            </div>
            {typeof facts.dress_code === "string" && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-[#9c5e19]">
                  {p("dressCodeLabel")}
                </summary>
                <p className="mt-2 text-sm leading-6 text-[#796b5d]">
                  {facts.dress_code}
                </p>
              </details>
            )}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              {sourceURLs.slice(0, 4).map((url, i) => (
                <a
                  key={i}
                  href={safeUrl(url)}
                  className="max-w-full break-words text-[#9c5e19] underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p("source")} {i + 1}: {new URL(url).hostname} ↗
                </a>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}
