import { describe, expect, it, vi, afterEach } from "vitest";
import {
  calendarText,
  platformLinks,
  planningFetch,
  safeUrl,
  type PlanningJob,
} from "../planning";
import { planningCopyKeys, planningT } from "../planningCopy";
import { loadTemples } from "../temples";
const job = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 2,
  result: {
    days: [
      {
        date: "2026-11-06",
        items: [
          {
            title: "Temple, seva; दर्शन తెలుగు " + "దేవాలయం ".repeat(30),
            start: "07:00",
            end: "08:15",
            source: "Catalog",
            url: "https://maps.google.com/",
          },
        ],
      },
    ],
  },
} as PlanningJob;

describe("real planning contracts", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("exports actual IST instants in UTC, with stable revision-scoped IDs", () => {
    const text = calendarText(job);
    expect(text).toContain("DTSTART:20261106T013000Z");
    expect(text).toContain("DTEND:20261106T024500Z");
    expect(text).toContain(`UID:${job.id}-2-2026-11-06-0@pilgrimai`);
    expect(text).toContain("Temple\\, seva\\;");
    expect(text).toContain("not a reservation");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("folds RFC5545 properties by UTF-8 octets without damaging Indian scripts", () => {
    const text = calendarText(job);
    for (const line of text.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = text.replace(/\r\n /g, "");
    expect(unfolded).toContain("दर्शन తెలుగు");
    expect(unfolded).toContain("దేవాలయం ".repeat(30));
  });
  it("empty or failed plans do not invent calendar events", () => {
    expect(calendarText({ ...job, result: null })).not.toContain(
      "BEGIN:VEVENT",
    );
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:///secret",
    "not a URL",
    null,
  ])("blocks unsafe outbound link %s", (value) => {
    expect(safeUrl(value)).toBeUndefined();
  });
  it("provides labelled platform search links with encoded Google directions", () => {
    const links = platformLinks("Warangal & area", "Yadadri / temple");
    expect(links.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        "redBus",
        "AbhiBus",
        "OYO",
        "Booking.com",
        "Google Maps",
      ]),
    );
    const map = new URL(links.find((x) => x.kind === "map")!.url);
    expect(map.searchParams.get("origin")).toBe("Warangal & area");
    expect(map.searchParams.get("destination")).toBe("Yadadri / temple");
    for (const l of links) expect(safeUrl(l.url)).toBeTruthy();
  });
  it("uses only same-origin Next planning API, not direct browser backend calls", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "actual-job" }),
    });
    vi.stubGlobal("fetch", mock);
    expect(await planningFetch("jobs", { method: "POST", body: "{}" })).toEqual(
      { id: "actual-job" },
    );
    expect(mock.mock.calls[0][0]).toBe("/api/planning/jobs");
    expect(mock.mock.calls[0][1].credentials).toBe("same-origin");
  });
  it("does not convert an upstream error into success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "queue full" }),
      }),
    );
    await expect(planningFetch("jobs")).rejects.toThrow("queue full");
  });
  it("all new UI dictionary entries have EN/TE/HI text", () => {
    expect(planningCopyKeys.length).toBeGreaterThan(70);
    for (const key of planningCopyKeys)
      for (const lang of ["en", "te", "hi"] as const) {
        const text = planningT(lang, key);
        expect(text.length).toBeGreaterThan(1);
        if (!key.includes(" ")) expect(text).not.toBe(key);
      }
  });
  it("uses only real supplied clips: eleven distinct temples, twelve clips", () => {
    const temples = loadTemples();
    expect(temples.length).toBe(23);
    const withVideo = temples.filter((t) => t.videoUrl);
    expect(withVideo.length).toBe(11);
    expect(
      withVideo.reduce((sum, t) => sum + (t.videoUrls?.length || 0), 0),
    ).toBe(12);
    expect(temples.find((t) => t.templeId === "T0014")?.videoUrls).toContain(
      "https://youtu.be/yjRxKWxewqM",
    );
    expect(temples.find((t) => t.templeId === "T0019")?.videoUrl).toBe(
      "https://youtu.be/aNInk-5uK38",
    );
  });
});
