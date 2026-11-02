import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "../../src/proxy";
describe("planning identity established before client effects", () => {
  it("creates an HttpOnly cookie on the initial HTML response, without a backend call", () => {
    const response = proxy(new NextRequest("https://app.example/plan"));
    const value = response.cookies.get("pilgrim_planning_owner")?.value;
    expect(value).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
  it("does not rotate an existing identity when navigating or reloading", () => {
    const request = new NextRequest("https://app.example/itinerary", {
      headers: {
        cookie: "pilgrim_planning_owner=11111111-1111-4111-8111-111111111111",
      },
    });
    expect(proxy(request).headers.get("set-cookie")).toBeNull();
  });
  it("replaces a malformed identity and only matches planning pages", () => {
    expect(
      proxy(
        new NextRequest("https://app.example/plan", {
          headers: { cookie: "pilgrim_planning_owner=bad" },
        }),
      ).cookies.get("pilgrim_planning_owner")?.value,
    ).not.toBe("bad");
    expect(config.matcher).toEqual([
      "/plan",
      "/planning/:path*",
      "/itinerary/:path*",
    ]);
  });
});
